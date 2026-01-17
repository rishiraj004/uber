import { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Navigation, Loader2, X } from 'lucide-react';
import api from '../services/api';

interface AddressSuggestion {
  name: string;
  latitude: number;
  longitude: number;
}

interface AddressAutocompleteProps {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: AddressSuggestion) => void;
  icon?: 'pickup' | 'dropoff';
  sessionToken: string;
}

// Debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

const AddressAutocomplete = ({
  placeholder,
  value,
  onChange,
  onSelect,
  icon = 'pickup',
  sessionToken
}: AddressAutocompleteProps) => {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [hasSelected, setHasSelected] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounce the search query (400ms)
  const debouncedQuery = useDebounce(value, 400);

  // Fetch suggestions when debounced query changes
  useEffect(() => {
    const fetchSuggestions = async () => {
      // Don't fetch if user just selected an item or query is too short
      if (hasSelected || debouncedQuery.trim().length < 3) {
        setSuggestions([]);
        return;
      }

      setIsLoading(true);
      try {
        const response = await api.get('/map/address-suggestions', {
          params: {
            query: debouncedQuery,
            sessionToken
          }
        });
        setSuggestions(response.data || []);
      } catch (error) {
        console.error('Error fetching suggestions:', error);
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSuggestions();
  }, [debouncedQuery, sessionToken, hasSelected]);

  // Handle click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setSuggestions([]);
        setIsFocused(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setHasSelected(false);
    onChange(e.target.value);
  }, [onChange]);

  const handleSelect = useCallback((suggestion: AddressSuggestion) => {
    setHasSelected(true);
    onChange(suggestion.name);
    onSelect(suggestion);
    setSuggestions([]);
    setIsFocused(false);
  }, [onChange, onSelect]);

  const handleClear = useCallback(() => {
    onChange('');
    setHasSelected(false);
    setSuggestions([]);
    inputRef.current?.focus();
  }, [onChange]);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    setHasSelected(false);
  }, []);

  const IconComponent = icon === 'pickup' ? MapPin : Navigation;
  const iconColor = icon === 'pickup' ? 'text-blue-500' : 'text-zinc-900';

  return (
    <div ref={containerRef} className="relative">
      <div className={`
        flex items-center gap-3 bg-zinc-50 px-4 py-3.5 rounded-xl border-2 transition-all duration-200
        ${isFocused ? 'border-zinc-900 bg-white shadow-sm' : 'border-transparent'}
        ${hasSelected && value ? 'bg-green-50 border-green-200' : ''}
      `}>
        <IconComponent size={20} className={`shrink-0 ${hasSelected && value ? 'text-green-600' : iconColor}`} />
        <input
          ref={inputRef}
          type="text"
          className="flex-1 bg-transparent outline-none text-zinc-900 placeholder:text-zinc-400 text-sm font-medium"
          placeholder={placeholder}
          value={value}
          onChange={handleInputChange}
          onFocus={handleFocus}
        />
        {isLoading && (
          <Loader2 size={18} className="text-zinc-400 animate-spin shrink-0" />
        )}
        {value && !isLoading && (
          <button
            onClick={handleClear}
            className="p-1 hover:bg-zinc-200 rounded-full transition-colors shrink-0"
            type="button"
          >
            <X size={16} className="text-zinc-400" />
          </button>
        )}
      </div>

      {/* Suggestions Dropdown */}
      {suggestions.length > 0 && isFocused && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-zinc-100 overflow-hidden z-50 max-h-64 overflow-y-auto">
          {suggestions.map((suggestion, index) => (
            <button
              key={index}
              type="button"
              onClick={() => handleSelect(suggestion)}
              className="w-full px-4 py-3 text-left hover:bg-zinc-50 transition-colors border-b border-zinc-50 last:border-none flex items-start gap-3"
            >
              <MapPin size={16} className="text-zinc-400 mt-0.5 shrink-0" />
              <span className="text-sm text-zinc-700 leading-tight">{suggestion.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default AddressAutocomplete;
