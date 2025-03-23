export interface ThemeType {
  colors: {
    primary: string;
    secondary: string;
    background: string;
    text: string;
    error: string;
    success: string;
    warning: string;
    lightGray: string;
    darkGray: string;
  };
  breakpoints: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
  spacing: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
  borderRadius: {
    small: string;
    medium: string;
    large: string;
    round: string;
  };
  transition: string;
  boxShadow: string;
}

const theme: ThemeType = {
  colors: {
    primary: '#4F46E5',
    secondary: '#06B6D4',
    background: '#F9FAFB',
    text: '#1F2937',
    error: '#EF4444',
    success: '#10B981',
    warning: '#F59E0B',
    lightGray: '#E5E7EB',
    darkGray: '#6B7280',
  },
  breakpoints: {
    xs: '320px',
    sm: '576px',
    md: '768px',
    lg: '992px',
    xl: '1200px',
  },
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
  },
  borderRadius: {
    small: '0.25rem',
    medium: '0.5rem',
    large: '1rem',
    round: '50%',
  },
  transition: 'all 0.3s ease-in-out',
  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
};

export default theme; 