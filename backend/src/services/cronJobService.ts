import cron from 'node-cron';
import { checkExpiredDocuments } from './documentVerificationService';
import { cleanupStaleBids } from './biddingService';
import { cleanupHeatmapData } from './heatmapService';
import prisma from '../config/prisma';
import redisClient from '../config/redis';

/**
 * Cron Job Service
 * 
 * Scheduled tasks:
 * 1. Document expiry check - Daily at 6 AM
 * 2. Stale ride cleanup - Every 15 minutes
 * 3. Heatmap data cleanup - Every hour
 * 4. Captain availability reset - Daily at midnight
 * 5. Shift auto-end - Every 5 minutes
 */

interface CronJobResult {
    job: string;
    status: 'success' | 'error';
    message: string;
    timestamp: Date;
    details?: unknown;
}

const jobResults: CronJobResult[] = [];

/**
 * Log job result
 */
const logJobResult = (result: CronJobResult) => {
    jobResults.push(result);
    // Keep only last 100 results
    if (jobResults.length > 100) {
        jobResults.shift();
    }
    console.log(`[CRON] ${result.job}: ${result.status} - ${result.message}`);
};

/**
 * Check for expired documents and notify captains
 * Runs daily at 6 AM
 */
const documentExpiryJob = cron.schedule('0 6 * * *', async () => {
    console.log('[CRON] Starting document expiry check...');
    
    try {
        const result = await checkExpiredDocuments();
        logJobResult({
            job: 'DOCUMENT_EXPIRY_CHECK',
            status: 'success',
            message: `Checked documents: ${result.expired} expired, ${result.expiringSoon} expiring soon, ${result.notified} notified`,
            timestamp: new Date(),
            details: result
        });
    } catch (error) {
        logJobResult({
            job: 'DOCUMENT_EXPIRY_CHECK',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date()
        });
    }
});
documentExpiryJob.stop(); // Start stopped

/**
 * Clean up stale rides that haven't been accepted
 * Runs every 15 minutes
 */
const staleRideCleanupJob = cron.schedule('*/15 * * * *', async () => {
    console.log('[CRON] Starting stale ride cleanup...');
    
    try {
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
        
        // Cancel rides that have been pending for more than 15 minutes
        const result = await prisma.ride.updateMany({
            where: {
                status: 'PENDING',
                createdAt: { lt: fifteenMinutesAgo }
            },
            data: {
                status: 'CANCELLED'
            }
        });
        
        // Also cleanup stale bids
        const staleBidsCleanup = await cleanupStaleBids();
        
        logJobResult({
            job: 'STALE_RIDE_CLEANUP',
            status: 'success',
            message: `Cancelled ${result.count} stale rides, cleaned up stale bids`,
            timestamp: new Date(),
            details: { cancelledRides: result.count, staleBidsCleanup }
        });
    } catch (error) {
        logJobResult({
            job: 'STALE_RIDE_CLEANUP',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date()
        });
    }
});
staleRideCleanupJob.stop();

/**
 * Clean up old heatmap data
 * Runs every hour
 */
const heatmapCleanupJob = cron.schedule('0 * * * *', async () => {
    console.log('[CRON] Starting heatmap data cleanup...');
    
    try {
        const cleanedCount = await cleanupHeatmapData();
        logJobResult({
            job: 'HEATMAP_CLEANUP',
            status: 'success',
            message: `Cleaned up ${cleanedCount} old heatmap entries`,
            timestamp: new Date(),
            details: { cleanedCount }
        });
    } catch (error) {
        logJobResult({
            job: 'HEATMAP_CLEANUP',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date()
        });
    }
});
heatmapCleanupJob.stop();

/**
 * Reset captain availability at midnight
 * Runs daily at 12:00 AM
 */
const availabilityResetJob = cron.schedule('0 0 * * *', async () => {
    console.log('[CRON] Starting availability reset...');
    
    try {
        // Find captains who are still available but likely inactive
        // Just reset those who have been online for too long
        const result = await prisma.captainProfile.updateMany({
            where: {
                isAvailable: true,
                isOnline: false
            },
            data: {
                isAvailable: false
            }
        });
        
        logJobResult({
            job: 'AVAILABILITY_RESET',
            status: 'success',
            message: `Reset availability for ${result.count} inactive captains`,
            timestamp: new Date(),
            details: { resetCount: result.count }
        });
    } catch (error) {
        logJobResult({
            job: 'AVAILABILITY_RESET',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date()
        });
    }
});
availabilityResetJob.stop();

/**
 * Auto-end shifts that have exceeded max duration (12 hours)
 * Runs every 5 minutes
 */
const autoEndShiftJob = cron.schedule('*/5 * * * *', async () => {
    console.log('[CRON] Starting auto-end shift check...');
    
    try {
        const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
        
        // Find active shifts that started more than 12 hours ago
        const overdueShifts = await prisma.shift.findMany({
            where: {
                endTime: null,
                startTime: { lt: twelveHoursAgo }
            },
            include: {
                captain: { include: { user: true } }
            }
        });
        
        // End each overdue shift
        for (const shift of overdueShifts) {
            await prisma.shift.update({
                where: { id: shift.id },
                data: { endTime: new Date() }
            });
            
            await prisma.captainProfile.update({
                where: { id: shift.captain.id },
                data: { isAvailable: false }
            });
            
            console.log(`[CRON] Auto-ended shift ${shift.id} for captain ${shift.captain.user.fullName}`);
        }
        
        logJobResult({
            job: 'AUTO_END_SHIFT',
            status: 'success',
            message: `Auto-ended ${overdueShifts.length} overdue shifts`,
            timestamp: new Date(),
            details: { endedShifts: overdueShifts.length }
        });
    } catch (error) {
        logJobResult({
            job: 'AUTO_END_SHIFT',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date()
        });
    }
});
autoEndShiftJob.stop();

/**
 * Clean up orphaned rides with ARRIVED status but no activity
 * Runs every 30 minutes
 */
const orphanedRideCleanupJob = cron.schedule('*/30 * * * *', async () => {
    console.log('[CRON] Starting orphaned ride cleanup...');
    
    try {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        
        // Find rides that have been in ARRIVED status for more than 1 hour
        const orphanedRides = await prisma.ride.updateMany({
            where: {
                status: 'ARRIVED',
                updatedAt: { lt: oneHourAgo }
            },
            data: {
                status: 'CANCELLED'
            }
        });
        
        logJobResult({
            job: 'ORPHANED_RIDE_CLEANUP',
            status: 'success',
            message: `Cancelled ${orphanedRides.count} orphaned rides`,
            timestamp: new Date(),
            details: { cancelledCount: orphanedRides.count }
        });
    } catch (error) {
        logJobResult({
            job: 'ORPHANED_RIDE_CLEANUP',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date()
        });
    }
});
orphanedRideCleanupJob.stop();

/**
 * Calculate and store daily statistics
 * Runs daily at 11:59 PM
 */
const dailyStatsJob = cron.schedule('59 23 * * *', async () => {
    console.log('[CRON] Calculating daily statistics...');
    
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        // Get today's ride statistics
        const stats = await prisma.ride.aggregate({
            where: {
                createdAt: { gte: today, lt: tomorrow }
            },
            _count: true,
            _sum: {
                fare: true
            }
        });
        
        const completedRides = await prisma.ride.count({
            where: {
                createdAt: { gte: today, lt: tomorrow },
                status: 'COMPLETED'
            }
        });
        
        const cancelledRides = await prisma.ride.count({
            where: {
                createdAt: { gte: today, lt: tomorrow },
                status: 'CANCELLED'
            }
        });
        
        // Store stats in Redis for dashboard
        await redisClient.hset(`stats:daily:${today.toISOString().split('T')[0]}`, {
            totalRides: (stats._count || 0).toString(),
            completedRides: completedRides.toString(),
            cancelledRides: cancelledRides.toString(),
            totalRevenue: (stats._sum?.fare || 0).toString()
        });
        
        // Keep daily stats for 90 days
        await redisClient.expire(`stats:daily:${today.toISOString().split('T')[0]}`, 90 * 24 * 60 * 60);
        
        logJobResult({
            job: 'DAILY_STATS',
            status: 'success',
            message: `Calculated stats: ${stats._count} total rides, ${completedRides} completed`,
            timestamp: new Date(),
            details: {
                totalRides: stats._count,
                completedRides,
                cancelledRides,
                totalRevenue: stats._sum?.fare
            }
        });
    } catch (error) {
        logJobResult({
            job: 'DAILY_STATS',
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date()
        });
    }
});
dailyStatsJob.stop();

/**
 * Start all cron jobs
 */
export const startCronJobs = () => {
    console.log('[CRON] Starting all cron jobs...');
    
    documentExpiryJob.start();
    staleRideCleanupJob.start();
    heatmapCleanupJob.start();
    availabilityResetJob.start();
    autoEndShiftJob.start();
    orphanedRideCleanupJob.start();
    dailyStatsJob.start();
    
    console.log('[CRON] All cron jobs started successfully');
};

/**
 * Stop all cron jobs (for graceful shutdown)
 */
export const stopCronJobs = () => {
    console.log('[CRON] Stopping all cron jobs...');
    
    documentExpiryJob.stop();
    staleRideCleanupJob.stop();
    heatmapCleanupJob.stop();
    availabilityResetJob.stop();
    autoEndShiftJob.stop();
    orphanedRideCleanupJob.stop();
    dailyStatsJob.stop();
    
    console.log('[CRON] All cron jobs stopped');
};

/**
 * Get recent job results (for admin dashboard)
 */
export const getJobResults = (): CronJobResult[] => {
    return [...jobResults].reverse();
};

/**
 * Manually trigger a specific job (for testing/admin)
 */
export const triggerJob = async (jobName: string): Promise<CronJobResult> => {
    switch (jobName) {
        case 'DOCUMENT_EXPIRY_CHECK':
            try {
                const result = await checkExpiredDocuments();
                return {
                    job: 'DOCUMENT_EXPIRY_CHECK',
                    status: 'success',
                    message: `Manual trigger: ${result.expired} expired, ${result.notified} notified`,
                    timestamp: new Date(),
                    details: result
                };
            } catch (error) {
                return {
                    job: 'DOCUMENT_EXPIRY_CHECK',
                    status: 'error',
                    message: error instanceof Error ? error.message : 'Unknown error',
                    timestamp: new Date()
                };
            }
        
        // Add other manual triggers as needed
        default:
            return {
                job: jobName,
                status: 'error',
                message: 'Unknown job name',
                timestamp: new Date()
            };
    }
};
