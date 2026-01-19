import { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Navigation, Loader2, X, Building2, MapPinned, Home } from 'lucide-react';
import api from '../services/api';

interface AddressSuggestion {
  name: string;
  fullAddress?: string;
  mapboxId?: string;
  latitude: number | null;
  longitude: number | null;
  featureType?: string;
}

interface AddressAutocompleteProps {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: { name: string; latitude: number; longitude: number }) => void;
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

// Get icon based on feature type
const getFeatureIcon = (featureType?: string) => {
  switch (featureType) {
    case 'poi':
      return <Building2 size={14} className="text-purple-500" />;
    case 'address':
      return <Home size={14} className="text-blue-500" />;
    case 'place':
    case 'locality':
      return <MapPinned size={14} className="text-green-500" />;
    default:
      return <MapPin size={14} className="text-zinc-400" />;
  }
};

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
  const [isRetrieving, setIsRetrieving] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [hasSelected, setHasSelected] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Get user's current location for proximity bias
  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      },
      () => {} // Silently fail if location not available
    );
  }, []);

  // Debounce the search query (400ms)
  const debouncedQuery = useDebounce(value, 400);

  // Fetch suggestions when debounced query changes
  useEffect(() => {
    const fetchSuggestions = async () => {
      // Don't fetch if user just selected an item or query is too short
      if (hasSelected || debouncedQuery.trim().length < 2) {
        setSuggestions([]);
        return;
      }

      setIsLoading(true);
      try {
        const params: Record<string, string | number> = {
          query: debouncedQuery,
          sessionToken
        };

        // Add proximity for better local results
        if (userLocation) {
          params.lat = userLocation.lat;
          params.lng = userLocation.lng;
        }

        const response = await api.get('/map/address-suggestions', { params });
        setSuggestions(response.data || []);
      } catch (error) {
        console.error('Error fetching suggestions:', error);
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSuggestions();
  }, [debouncedQuery, sessionToken, hasSelected, userLocation]);

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

  const handleSelect = useCallback(async (suggestion: AddressSuggestion) => {
    setHasSelected(true);
    onChange(suggestion.fullAddress || suggestion.name);
    setSuggestions([]);
    setIsFocused(false);

    // If we already have coordinates (from fallback geocoding), use them directly
    if (suggestion.latitude !== null && suggestion.longitude !== null) {
      onSelect({
        name: suggestion.fullAddress || suggestion.name,
        latitude: suggestion.latitude,
        longitude: suggestion.longitude
      });
      return;
    }

    // Otherwise, retrieve full details from Search Box API
    if (suggestion.mapboxId) {
      setIsRetrieving(true);
      try {
        const response = await api.get('/map/retrieve-place', {
          params: {
            mapboxId: suggestion.mapboxId,
            sessionToken
          }
        });

        if (response.data?.latitude && response.data?.longitude) {
          onSelect({
            name: response.data.fullAddress || suggestion.name,
            latitude: response.data.latitude,
            longitude: response.data.longitude
          });
        }
      } catch (error) {
        console.error('Error retrieving place details:', error);
      } finally {
        setIsRetrieving(false);
      }
    }
  }, [onChange, onSelect, sessionToken]);

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
        {(isLoading || isRetrieving) && (
          <Loader2 size={18} className="text-zinc-400 animate-spin shrink-0" />
        )}
        {value && !isLoading && !isRetrieving && (
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
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-zinc-100 overflow-hidden z-50 max-h-72 overflow-y-auto">
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.mapboxId || index}
              type="button"
              onClick={() => handleSelect(suggestion)}
              className="w-full px-4 py-3 text-left hover:bg-zinc-50 transition-colors border-b border-zinc-50 last:border-none flex items-start gap-3 group"
            >
              <div className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center shrink-0 group-hover:bg-zinc-200 transition-colors">
                {getFeatureIcon(suggestion.featureType)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-900 truncate">{suggestion.name}</p>
                {suggestion.fullAddress && suggestion.fullAddress !== suggestion.name && (
                  <p className="text-xs text-zinc-500 truncate mt-0.5">{suggestion.fullAddress}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default AddressAutocomplete;
