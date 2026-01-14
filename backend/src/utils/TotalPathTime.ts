export const calculateTotalTime = (logs: any[]): number => {
    if (logs.length < 2) return 0;

    const startTime = new Date(logs[0].timestamp).getTime();
    const endTime = new Date(logs[logs.length - 1].timestamp).getTime();
    const totalDurationMinutes = (endTime - startTime) / (1000 * 60);

    return parseFloat(totalDurationMinutes.toFixed(2));
};