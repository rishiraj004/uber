import { useState, useEffect, useRef } from 'react';
import { X, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocket } from '../context/socket-context';
import api from '../services/api';

interface ChatMessage {
  id: number;
  message: string;
  senderId: number;
  senderName: string;
  senderRole: 'RIDER' | 'CAPTAIN';
  isOwn: boolean;
  createdAt: string;
}

interface RideChatProps {
  isOpen: boolean;
  onClose: () => void;
  rideId: number;
  recipientName: string;
  recipientRole: 'RIDER' | 'CAPTAIN';
}

const RideChat = ({ isOpen, onClose, rideId, recipientName, recipientRole }: RideChatProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const socket = useSocket();

  const token = localStorage.getItem('token');
  const currentUserId = token ? JSON.parse(atob(token.split('.')[1])).userId : null;

  // Fetch existing messages
  useEffect(() => {
    if (!isOpen || !rideId) return;

    const fetchMessages = async () => {
      setLoading(true);
      try {
        const response = await api.get(`/chat/${rideId}`);
        setMessages(response.data.messages);
      } catch (error) {
        console.error("Error fetching messages:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchMessages();
  }, [isOpen, rideId]);

  // Socket listeners for real-time messages
  useEffect(() => {
    if (!socket || !isOpen) return;

    const handleNewMessage = (data: {
      messageId: number;
      rideId: number;
      senderId: number;
      senderName: string;
      senderRole: 'RIDER' | 'CAPTAIN';
      message: string;
      createdAt: string;
    }) => {
      if (data.rideId === rideId) {
        setMessages(prev => [...prev, {
          id: data.messageId,
          message: data.message,
          senderId: data.senderId,
          senderName: data.senderName,
          senderRole: data.senderRole,
          isOwn: data.senderId === currentUserId,
          createdAt: data.createdAt
        }]);
      }
    };

    const handleTyping = (data: { rideId: number; userId: number }) => {
      if (data.rideId === rideId && data.userId !== currentUserId) {
        setIsTyping(true);
      }
    };

    const handleStopTyping = (data: { rideId: number; userId: number }) => {
      if (data.rideId === rideId && data.userId !== currentUserId) {
        setIsTyping(false);
      }
    };

    const handleMessageSent = (data: { messageId: number; rideId: number; message: string; createdAt: string }) => {
      // Add our own message to the list when confirmed
      if (data.rideId === rideId) {
        setMessages(prev => {
          // Check if message already exists
          if (prev.find(m => m.id === data.messageId)) return prev;
          return [...prev, {
            id: data.messageId,
            message: data.message,
            senderId: currentUserId!,
            senderName: 'You',
            senderRole: recipientRole === 'CAPTAIN' ? 'RIDER' : 'CAPTAIN',
            isOwn: true,
            createdAt: data.createdAt
          }];
        });
      }
    };

    socket.on('NEW_CHAT_MESSAGE', handleNewMessage);
    socket.on('USER_TYPING', handleTyping);
    socket.on('USER_STOPPED_TYPING', handleStopTyping);
    socket.on('CHAT_MESSAGE_SENT', handleMessageSent);

    return () => {
      socket.off('NEW_CHAT_MESSAGE', handleNewMessage);
      socket.off('USER_TYPING', handleTyping);
      socket.off('USER_STOPPED_TYPING', handleStopTyping);
      socket.off('CHAT_MESSAGE_SENT', handleMessageSent);
    };
  }, [socket, isOpen, rideId, currentUserId, recipientRole]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    
    // Emit typing indicator
    if (socket) {
      socket.emit('TYPING_START', { rideId });
      
      // Clear existing timeout
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      
      // Set new timeout to stop typing indicator
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit('TYPING_STOP', { rideId });
      }, 1000);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || sending) return;

    const messageText = newMessage.trim();
    setNewMessage('');
    setSending(true);

    // Stop typing indicator
    if (socket) {
      socket.emit('TYPING_STOP', { rideId });
    }

    try {
      // Send via socket for real-time
      if (socket) {
        socket.emit('SEND_CHAT_MESSAGE', {
          rideId,
          message: messageText
        });
      } else {
        // Fallback to API
        await api.post('/chat/send', {
          rideId,
          message: messageText
        });
      }
    } catch (error) {
      console.error("Error sending message:", error);
      // Put the message back if failed
      setNewMessage(messageText);
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="absolute bottom-0 left-0 right-0 sm:left-auto sm:right-4 sm:bottom-4 bg-white sm:w-96 h-[75vh] sm:h-125 sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="bg-zinc-900 text-white p-3 sm:p-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20 rounded-full flex items-center justify-center">
                <span className="text-sm sm:text-lg font-bold">{recipientName.charAt(0)}</span>
              </div>
              <div>
                <h3 className="font-semibold text-sm sm:text-base">{recipientName}</h3>
                <p className="text-[10px] sm:text-xs text-white/70">
                  {isTyping ? 'Typing...' : recipientRole === 'CAPTAIN' ? 'Your Captain' : 'Your Rider'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 sm:p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X size={18} className="sm:w-5 sm:h-5" />
            </button>
          </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 bg-gray-50">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-5 h-5 sm:w-6 sm:h-6 border-2 border-zinc-900 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gray-100 rounded-full flex items-center justify-center mb-2 sm:mb-3">
                <Send size={20} className="sm:w-6 sm:h-6 text-gray-300" />
              </div>
              <p className="text-xs sm:text-sm">No messages yet</p>
              <p className="text-[10px] sm:text-xs mt-1">Start the conversation!</p>
            </div>
          ) : (
            <div className="space-y-2 sm:space-y-3">
              {messages.map((msg, index) => (
                <motion.div
                  key={msg.id || index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.isOwn ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 sm:px-4 py-2 sm:py-2.5 ${
                      msg.isOwn
                        ? 'bg-zinc-900 text-white rounded-br-md'
                        : 'bg-white text-gray-900 shadow-sm rounded-bl-md'
                    }`}
                  >
                    <p className="text-xs sm:text-sm leading-relaxed">{msg.message}</p>
                    <p className={`text-[9px] sm:text-[10px] mt-1 ${msg.isOwn ? 'text-white/50' : 'text-gray-400'}`}>
                      {formatTime(msg.createdAt)}
                    </p>
                  </div>
                </motion.div>
              ))}
              
              {/* Typing indicator */}
              {isTyping && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-start"
                >
                  <div className="bg-white shadow-sm rounded-2xl rounded-bl-md px-3 sm:px-4 py-2.5 sm:py-3">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </motion.div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-3 sm:p-4 bg-white border-t border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={newMessage}
              onChange={handleInputChange}
              onKeyPress={handleKeyPress}
              placeholder="Type a message..."
              className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 bg-gray-100 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
            />
            <button
              onClick={handleSendMessage}
              disabled={!newMessage.trim() || sending}
              className="p-2.5 sm:p-3 bg-zinc-900 text-white rounded-xl hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={16} className="sm:w-4.5 sm:h-4.5" />
            </button>
          </div>
        </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default RideChat;
