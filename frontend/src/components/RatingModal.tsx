import { useState } from 'react';
import { Star, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../services/api';
import toast from 'react-hot-toast';

interface RatingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: () => void;
  rideId: number;
  recipientName: string;
  reviewType: 'RIDER_TO_CAPTAIN' | 'CAPTAIN_TO_RIDER';
  title?: string;
}

const RatingModal = ({
  isOpen,
  onClose,
  onSubmit,
  rideId,
  recipientName,
  reviewType,
  title
}: RatingModalProps) => {
  const [rating, setRating] = useState(5);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (rating < 1 || rating > 5) {
      toast.error('Please select a rating');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post('/review/submit', {
        rideId,
        rating,
        comment: comment.trim() || undefined,
        type: reviewType
      });
      toast.success('Review submitted successfully!');
      onSubmit();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Failed to submit review');
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayRating = hoveredRating || rating;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl relative"
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-100 transition-colors"
              aria-label="Close"
            >
              <X size={20} className="text-gray-500" />
            </button>

            {/* Header */}
            <div className="text-center mb-8">
              <h2 className="text-2xl font-black mb-2">
                {title || (reviewType === 'RIDER_TO_CAPTAIN' ? 'Rate Your Captain' : 'Rate Your Rider')}
              </h2>
              <p className="text-gray-500">
                How was your experience with <span className="font-bold text-black">{recipientName}</span>?
              </p>
            </div>

            {/* Star Rating */}
            <div className="flex justify-center gap-2 mb-8">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  className="p-1 transition-transform hover:scale-110 focus:outline-none"
                  aria-label={`Rate ${star} stars`}
                >
                  <Star
                    size={40}
                    className={`transition-colors ${
                      star <= displayRating
                        ? 'fill-yellow-400 text-yellow-400'
                        : 'text-gray-300'
                    }`}
                  />
                </button>
              ))}
            </div>

            {/* Rating Text */}
            <p className="text-center text-lg font-bold mb-6">
              {displayRating === 1 && '😞 Poor'}
              {displayRating === 2 && '😐 Fair'}
              {displayRating === 3 && '🙂 Good'}
              {displayRating === 4 && '😊 Great'}
              {displayRating === 5 && '🌟 Excellent'}
            </p>

            {/* Comment Box */}
            <div className="mb-6">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                Additional Feedback (Optional)
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Share your experience..."
                className="w-full p-4 border-2 border-gray-100 rounded-2xl focus:border-black focus:outline-none resize-none transition-colors"
                rows={3}
                maxLength={500}
              />
              <p className="text-right text-xs text-gray-400 mt-1">{comment.length}/500</p>
            </div>

            {/* Submit Button */}
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="w-full bg-black text-white py-4 rounded-2xl font-bold text-lg hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Rating'}
            </button>

            {/* Skip Button */}
            <button
              onClick={onClose}
              className="w-full text-gray-500 py-3 font-medium text-sm hover:text-black transition-colors mt-2"
            >
              Skip for now
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default RatingModal;
