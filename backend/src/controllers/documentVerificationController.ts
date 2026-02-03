import { Request, Response, NextFunction } from "express";
import * as documentVerificationService from "../services/documentVerificationService";

/**
 * Document Verification Controller - OCR and govt records sync
 */

/**
 * @desc Process document with OCR
 * @route POST /api/v1/documents/:documentId/verify
 * @access Private (Admin)
 */
export const verifyDocument = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const documentId = parseInt(req.params.documentId);
        const captainId = parseInt(req.body.captainId);

        const result = await documentVerificationService.verifyDocument(captainId, documentId);

        return res.status(200).json({
            success: true,
            message: result.isApproved 
                ? "Document verified successfully" 
                : "Document verification failed",
            data: {
                ocr: {
                    documentNumber: result.ocr.documentNumber,
                    expiryDate: result.ocr.expiryDate,
                    holderName: result.ocr.holderName,
                    confidence: result.ocr.confidence
                },
                verification: {
                    isValid: result.verification.isValid,
                    status: result.verification.status,
                    officialExpiryDate: result.verification.officialExpiryDate,
                    message: result.verification.message
                },
                isApproved: result.isApproved
            }
        });
    } catch (error: any) {
        console.error("Document verification error:", error);
        return res.status(400).json({
            success: false,
            message: error.message || "Failed to verify document"
        });
    }
};

/**
 * @desc Captain manually syncs documents with govt records
 * @route POST /api/v1/documents/sync
 * @access Private (Captain)
 */
export const syncWithGovtRecords = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = (req as any).user?.userId;

        const result = await documentVerificationService.syncWithGovtRecords(userId);

        return res.status(200).json({
            success: true,
            message: result.isFullyVerified 
                ? "All documents verified successfully!" 
                : "Some documents could not be verified",
            data: {
                license: result.license ? {
                    isValid: result.license.isValid,
                    status: result.license.status,
                    expiryDate: result.license.officialExpiryDate,
                    message: result.license.message
                } : null,
                rc: result.rc ? {
                    isValid: result.rc.isValid,
                    status: result.rc.status,
                    expiryDate: result.rc.officialExpiryDate,
                    message: result.rc.message
                } : null,
                isFullyVerified: result.isFullyVerified
            }
        });
    } catch (error: any) {
        console.error("Sync documents error:", error);
        return res.status(400).json({
            success: false,
            message: error.message || "Failed to sync documents"
        });
    }
};

/**
 * @desc Admin manually triggers document expiry check
 * @route POST /api/v1/documents/check-expiry
 * @access Private (Admin)
 */
export const checkExpiredDocuments = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await documentVerificationService.checkExpiredDocuments();

        return res.status(200).json({
            success: true,
            message: `Checked documents: ${result.expired} expired, ${result.expiringSoon} expiring soon, ${result.notified} captains notified`,
            data: result
        });
    } catch (error: any) {
        console.error("Check expired documents error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Failed to check expired documents"
        });
    }
};
