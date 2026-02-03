import Razorpay from 'razorpay';

// Create Razorpay instance only if credentials are provided
let razorpay: Razorpay | null = null;

const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;

if (keyId && keySecret) {
    razorpay = new Razorpay({
        key_id: keyId,
        key_secret: keySecret,
    });
} else {
    console.warn('⚠️  Razorpay credentials not configured. Payment features will be disabled.');
    console.warn('   Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET environment variables.');
}

// Create a mock Razorpay instance for development when credentials are not available
const mockRazorpay = {
    orders: {
        create: async (options: any) => ({
            id: `order_mock_${Date.now()}`,
            amount: options.amount,
            currency: options.currency,
            receipt: options.receipt,
            status: 'created'
        }),
        fetch: async (orderId: string) => ({
            id: orderId,
            status: 'paid'
        })
    },
    payments: {
        fetch: async (paymentId: string) => ({
            id: paymentId,
            status: 'captured',
            amount: 10000
        }),
        capture: async (paymentId: string, amount: number, currency: string) => ({
            id: paymentId,
            status: 'captured'
        }),
        refund: async (paymentId: string, options: any) => ({
            id: `rfnd_mock_${Date.now()}`,
            payment_id: paymentId,
            amount: options.amount
        })
    },
    customers: {
        create: async (options: any) => ({
            id: `cust_mock_${Date.now()}`,
            name: options.name,
            email: options.email
        })
    }
} as unknown as Razorpay;

export default razorpay || mockRazorpay;
