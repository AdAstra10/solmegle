import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import GlobalStyle from './styles/GlobalStyle';
import theme from './styles/theme';

// Pages
import SolmegleChat from './pages/SimplifiedChat';

const App: React.FC = () => {
  return (
    <ThemeProvider theme={theme}>
      <GlobalStyle />
      <Router>
        <Routes>
          <Route path="/" element={<SolmegleChat />} />
          <Route path="*" element={<SolmegleChat />} />
        </Routes>
      </Router>
    </ThemeProvider>
  );
};

export default App;
