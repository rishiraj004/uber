import prisma from '../config/prisma';
import axios from 'axios';
import { sendPushNotification } from './pushNotificationService';

/**
 * Document Verification Service - OCR and External API validation
 * 
 * Flow:
 * 1. Captain uploads document to Cloudinary
 * 2. Document URL sent to OCR API (Google Vision / AWS Textract simulation)
 * 3. Extract text and parse: License Number, Expiry Date, Name
 * 4. External verification via 3rd party API (IDfy/DeepSearch simulation)
 * 5. Store results and update captain verification status
 * 
 * Note: In production, replace mock APIs with actual:
 * - Google Cloud Vision API for OCR
 * - IDfy / DeepSearch / Signzy for document verification
 */

// API Configuration (use environment variables in production)
const OCR_API_URL = process.env.OCR_API_URL || 'https://vision.googleapis.com/v1/images:annotate';
const VERIFICATION_API_URL = process.env.VERIFICATION_API_URL || 'https://api.idfy.com/v3/verify';
const VERIFICATION_API_KEY = process.env.VERIFICATION_API_KEY || '';

interface OcrResult {
    extractedText: string;
    documentNumber: string | null;
    expiryDate: Date | null;
    holderName: string | null;
    confidence: number;
}

interface VerificationResult {
    isValid: boolean;
    status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'NOT_FOUND';
    officialExpiryDate: Date | null;
    holderName: string | null;
    message: string;
}

/**
 * Process uploaded document with OCR
 */
export const processDocumentOCR = async (
    documentId: number,
    documentUrl: string,
    documentType: string
): Promise<OcrResult> => {
    // In production, call actual OCR API
    // For now, simulate OCR response based on document type
    const mockOcrResult = await simulateOCR(documentUrl, documentType);
    
    // Update document with OCR results
    await prisma.captainDocument.update({
        where: { id: documentId },
        data: {
            extractedText: mockOcrResult.extractedText,
            extractedNumber: mockOcrResult.documentNumber,
            extractedExpiry: mockOcrResult.expiryDate,
            extractedName: mockOcrResult.holderName
        }
    });
    
    return mockOcrResult;
};

/**
 * Verify document against external government/official records
 */
export const verifyDocumentExternal = async (
    documentId: number,
    documentNumber: string,
    documentType: string
): Promise<VerificationResult> => {
    // In production, call actual verification API
    // For now, simulate verification response
    const verificationResult = await simulateExternalVerification(documentNumber, documentType);
    
    // Update document with verification results
    await prisma.captainDocument.update({
        where: { id: documentId },
        data: {
            externalVerified: verificationResult.isValid,
            externalVerifyStatus: verificationResult.status,
            lastExternalCheck: new Date(),
            extractedExpiry: verificationResult.officialExpiryDate,
            status: verificationResult.isValid ? 'VERIFIED' : 'REJECTED',
            verifiedAt: verificationResult.isValid ? new Date() : null
        }
    });
    
    return verificationResult;
};

/**
 * Full verification pipeline: OCR + External verification
 */
export const verifyDocument = async (
    captainId: number,
    documentId: number
): Promise<{
    ocr: OcrResult;
    verification: VerificationResult;
    isApproved: boolean;
}> => {
    const document = await prisma.captainDocument.findUnique({
        where: { id: documentId },
        include: { captain: { include: { user: true } } }
    });
    
    if (!document) {
        throw new Error('Document not found');
    }
    
    // Step 1: OCR
    const ocrResult = await processDocumentOCR(
        documentId,
        document.documentUrl,
        document.documentType
    );
    
    // Step 2: External verification (if document number was extracted)
    let verificationResult: VerificationResult = {
        isValid: false,
        status: 'NOT_FOUND',
        officialExpiryDate: null,
        holderName: null,
        message: 'Could not verify document'
    };
    
    if (ocrResult.documentNumber) {
        verificationResult = await verifyDocumentExternal(
            documentId,
            ocrResult.documentNumber,
            document.documentType
        );
    }
    
    // Step 3: Update captain profile if LICENSE or RC
    if (document.documentType === 'LICENSE' && verificationResult.isValid) {
        await prisma.captainProfile.update({
            where: { id: captainId },
            data: {
                licenseNumber: ocrResult.documentNumber,
                licenseExpiry: verificationResult.officialExpiryDate,
                ownerName: verificationResult.holderName || ocrResult.holderName,
                lastVerifiedAt: new Date()
            }
        });
    } else if (document.documentType === 'RC' && verificationResult.isValid) {
        await prisma.captainProfile.update({
            where: { id: captainId },
            data: {
                rcNumber: ocrResult.documentNumber,
                rcExpiry: verificationResult.officialExpiryDate,
                lastVerifiedAt: new Date()
            }
        });
    }
    
    return {
        ocr: ocrResult,
        verification: verificationResult,
        isApproved: verificationResult.isValid
    };
};

/**
 * Sync captain's documents with government records
 * Called when captain clicks "Sync with Govt Records"
 */
export const syncWithGovtRecords = async (captainUserId: number): Promise<{
    license: VerificationResult | null;
    rc: VerificationResult | null;
    isFullyVerified: boolean;
}> => {
    const captain = await prisma.captainProfile.findUnique({
        where: { userId: captainUserId },
        include: {
            documents: {
                where: { documentType: { in: ['LICENSE', 'RC'] } }
            }
        }
    });
    
    if (!captain) {
        throw new Error('Captain not found');
    }
    
    let licenseResult: VerificationResult | null = null;
    let rcResult: VerificationResult | null = null;
    
    // Re-verify license
    const licenseDoc = captain.documents.find(d => d.documentType === 'LICENSE');
    if (licenseDoc && captain.licenseNumber) {
        licenseResult = await verifyDocumentExternal(
            licenseDoc.id,
            captain.licenseNumber,
            'LICENSE'
        );
        
        if (licenseResult.isValid && licenseResult.officialExpiryDate) {
            await prisma.captainProfile.update({
                where: { id: captain.id },
                data: {
                    licenseExpiry: licenseResult.officialExpiryDate,
                    lastVerifiedAt: new Date()
                }
            });
        }
    }
    
    // Re-verify RC
    const rcDoc = captain.documents.find(d => d.documentType === 'RC');
    if (rcDoc && captain.rcNumber) {
        rcResult = await verifyDocumentExternal(
            rcDoc.id,
            captain.rcNumber,
            'RC'
        );
        
        if (rcResult.isValid && rcResult.officialExpiryDate) {
            await prisma.captainProfile.update({
                where: { id: captain.id },
                data: {
                    rcExpiry: rcResult.officialExpiryDate,
                    lastVerifiedAt: new Date()
                }
            });
        }
    }
    
    // Check if captain should be verified
    const isFullyVerified = 
        (licenseResult?.isValid ?? false) && 
        (rcResult?.isValid ?? false);
    
    if (isFullyVerified) {
        await prisma.captainProfile.update({
            where: { id: captain.id },
            data: { isVerified: true }
        });
    }
    
    return { license: licenseResult, rc: rcResult, isFullyVerified };
};

/**
 * Check for expired documents (called by cron job)
 */
export const checkExpiredDocuments = async (): Promise<{
    expired: number;
    expiringSoon: number;
    notified: number;
}> => {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    
    // Find captains with expired licenses
    const expiredLicenses = await prisma.captainProfile.findMany({
        where: {
            licenseExpiry: { lt: now },
            isVerified: true
        },
        include: { user: true }
    });
    
    // Find captains with licenses expiring in 30 days
    const expiringSoonLicenses = await prisma.captainProfile.findMany({
        where: {
            licenseExpiry: { gte: now, lt: thirtyDaysFromNow },
            isVerified: true
        },
        include: { user: true }
    });
    
    let notified = 0;
    
    // Handle expired licenses
    for (const captain of expiredLicenses) {
        await prisma.captainProfile.update({
            where: { id: captain.id },
            data: { isVerified: false, isAvailable: false }
        });
        
        // Send push notification
        if (captain.user.fcmToken) {
            await sendPushNotification(
                captain.userId,
                'DOCUMENT_EXPIRED',
                { documentType: 'LICENSE' }
            );
            notified++;
        }
    }
    
    // Warn about expiring soon
    for (const captain of expiringSoonLicenses) {
        if (captain.user.fcmToken) {
            const daysLeft = Math.ceil((captain.licenseExpiry!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
            await sendPushNotification(
                captain.userId,
                'DOCUMENT_EXPIRING',
                { documentType: 'LICENSE', daysLeft }
            );
            notified++;
        }
    }
    
    // Same for RC
    const expiredRCs = await prisma.captainProfile.findMany({
        where: {
            rcExpiry: { lt: now },
            isVerified: true
        },
        include: { user: true }
    });
    
    for (const captain of expiredRCs) {
        await prisma.captainProfile.update({
            where: { id: captain.id },
            data: { isVerified: false, isAvailable: false }
        });
        
        if (captain.user.fcmToken) {
            await sendPushNotification(
                captain.userId,
                'DOCUMENT_EXPIRED',
                { documentType: 'RC' }
            );
            notified++;
        }
    }
    
    return {
        expired: expiredLicenses.length + expiredRCs.length,
        expiringSoon: expiringSoonLicenses.length,
        notified
    };
};

// ============ SIMULATION FUNCTIONS ============
// Replace these with actual API calls in production

/**
 * Robust date parsing helper - handles multiple date formats from OCR
 * Prevents verification loops from date parsing failures
 */
function parseOcrDate(dateString: string | null | undefined): Date | null {
    if (!dateString) return null;
    
    // Common date formats found in Indian documents
    const formats = [
        // ISO format: 2028-12-31
        /^(\d{4})-(\d{2})-(\d{2})$/,
        // DD/MM/YYYY: 31/12/2028
        /^(\d{2})\/(\d{2})\/(\d{4})$/,
        // DD-MM-YYYY: 31-12-2028
        /^(\d{2})-(\d{2})-(\d{4})$/,
        // DD.MM.YYYY: 31.12.2028
        /^(\d{2})\.(\d{2})\.(\d{4})$/,
        // Month name: 31 Dec 2028 or Dec 31, 2028
        /^(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*,?\s*(\d{4})$/i,
        /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})\s*,?\s*(\d{4})$/i
    ];

    const monthMap: Record<string, number> = {
        'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
        'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
    };

    const cleanString = dateString.trim();

    for (const pattern of formats) {
        const match = cleanString.match(pattern);
        if (!match) continue;

        try {
            let year: number, month: number, day: number;

            if (pattern.source.includes('Jan|Feb')) {
                // Month name format
                if (pattern.source.startsWith('^(\\d')) {
                    // DD Month YYYY
                    day = parseInt(match[1], 10);
                    month = monthMap[match[2].toLowerCase().slice(0, 3)];
                    year = parseInt(match[3], 10);
                } else {
                    // Month DD, YYYY
                    month = monthMap[match[1].toLowerCase().slice(0, 3)];
                    day = parseInt(match[2], 10);
                    year = parseInt(match[3], 10);
                }
            } else if (pattern.source.startsWith('^(\\d{4})')) {
                // ISO: YYYY-MM-DD
                year = parseInt(match[1], 10);
                month = parseInt(match[2], 10) - 1;
                day = parseInt(match[3], 10);
            } else {
                // DD/MM/YYYY or DD-MM-YYYY
                day = parseInt(match[1], 10);
                month = parseInt(match[2], 10) - 1;
                year = parseInt(match[3], 10);
            }

            // Validate date components
            if (year < 1900 || year > 2100) continue;
            if (month < 0 || month > 11) continue;
            if (day < 1 || day > 31) continue;

            const date = new Date(year, month, day);
            
            // Verify the date is valid (e.g., no Feb 30)
            if (date.getFullYear() === year && 
                date.getMonth() === month && 
                date.getDate() === day) {
                return date;
            }
        } catch (e) {
            continue;
        }
    }

    // Fallback: Try native Date parsing
    try {
        const fallbackDate = new Date(cleanString);
        if (!isNaN(fallbackDate.getTime())) {
            return fallbackDate;
        }
    } catch (e) {
        // Ignore
    }

    // Could not parse - return null instead of throwing
    console.warn(`Could not parse OCR date: "${dateString}"`);
    return null;
}

async function simulateOCR(documentUrl: string, documentType: string): Promise<OcrResult> {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Generate mock OCR result based on document type
    const mockData: Record<string, () => OcrResult> = {
        LICENSE: () => ({
            extractedText: 'DRIVING LICENSE\nName: JOHN DOE\nLicense No: DL-1234567890\nValid Till: 2028-12-31\nAddress: 123 Main Street, City',
            documentNumber: 'DL-' + Math.random().toString().slice(2, 12),
            expiryDate: new Date(Date.now() + 2 * 365 * 24 * 60 * 60 * 1000), // 2 years from now
            holderName: 'John Doe',
            confidence: 0.92
        }),
        RC: () => ({
            extractedText: 'REGISTRATION CERTIFICATE\nOwner: JOHN DOE\nReg No: KA01AB1234\nValid Till: 2030-06-15\nVehicle: Toyota Innova',
            documentNumber: 'KA' + Math.floor(Math.random() * 100).toString().padStart(2, '0') + 'AB' + Math.floor(Math.random() * 10000).toString().padStart(4, '0'),
            expiryDate: new Date(Date.now() + 4 * 365 * 24 * 60 * 60 * 1000), // 4 years from now
            holderName: 'John Doe',
            confidence: 0.89
        }),
        INSURANCE: () => ({
            extractedText: 'INSURANCE CERTIFICATE\nPolicy No: INS123456789\nValid: 2024-01-01 to 2025-01-01\nInsured: JOHN DOE',
            documentNumber: 'INS' + Math.random().toString().slice(2, 12),
            expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
            holderName: 'John Doe',
            confidence: 0.95
        }),
        AADHAR: () => ({
            extractedText: 'GOVERNMENT OF INDIA\nAadhaar No: 1234 5678 9012\nName: JOHN DOE\nDOB: 01/01/1990',
            documentNumber: Math.random().toString().slice(2, 14).replace(/(\d{4})/g, '$1 ').trim(),
            expiryDate: null, // Aadhaar doesn't expire
            holderName: 'John Doe',
            confidence: 0.97
        }),
        PAN: () => ({
            extractedText: 'INCOME TAX DEPARTMENT\nPAN: ABCDE1234F\nName: JOHN DOE\nFather: JAMES DOE',
            documentNumber: 'ABCDE' + Math.floor(Math.random() * 10000).toString().padStart(4, '0') + 'F',
            expiryDate: null, // PAN doesn't expire
            holderName: 'John Doe',
            confidence: 0.94
        })
    };
    
    return mockData[documentType]?.() || {
        extractedText: 'Unable to process document',
        documentNumber: null,
        expiryDate: null,
        holderName: null,
        confidence: 0
    };
}

async function simulateExternalVerification(documentNumber: string, documentType: string): Promise<VerificationResult> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 800));
    
    // 90% chance of successful verification (for demo purposes)
    const isValid = Math.random() > 0.1;
    
    if (!isValid) {
        return {
            isValid: false,
            status: Math.random() > 0.5 ? 'SUSPENDED' : 'NOT_FOUND',
            officialExpiryDate: null,
            holderName: null,
            message: 'Document verification failed. Please ensure the document is valid and try again.'
        };
    }
    
    // Generate future expiry date
    const expiryYears = documentType === 'LICENSE' ? 2 : 4;
    const officialExpiryDate = new Date(Date.now() + expiryYears * 365 * 24 * 60 * 60 * 1000);
    
    return {
        isValid: true,
        status: 'ACTIVE',
        officialExpiryDate,
        holderName: 'John Doe', // In reality, would come from API
        message: 'Document verified successfully'
    };
}
