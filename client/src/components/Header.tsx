import React from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';

const Header: React.FC = () => {
  return (
    <HeaderContainer>
      <NavContainer>
        <LogoLink to="/">
          <Logo>Solmegle</Logo>
          <Tagline>Talk to strangers!</Tagline>
        </LogoLink>
        <CAText>CA:</CAText>
      </NavContainer>
    </HeaderContainer>
  );
};

const HeaderContainer = styled.header`
  background-color: white;
  padding: ${({ theme }) => theme.spacing.md} ${({ theme }) => theme.spacing.xl};
  border-bottom: 1px solid #e5e5e5;
  position: relative;
`;

const NavContainer = styled.nav`
  display: flex;
  justify-content: space-between;
  align-items: center;
  max-width: 1200px;
  margin: 0 auto;
`;

const LogoLink = styled(Link)`
  text-decoration: none;
`;

const Logo = styled.h1`
  font-size: 2rem;
  font-weight: 700;
  color: #f60;
  margin: 0;
  font-family: Arial, sans-serif;
`;

const NavLinks = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
`;

const WalletAddress = styled.span`
  font-weight: 600;
  font-family: monospace;
  font-size: 1rem;
  color: ${({ theme }) => theme.colors.text};
  background-color: ${({ theme }) => theme.colors.lightGray};
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  border-radius: ${({ theme }) => theme.borderRadius.small};
  display: flex;
  align-items: center;
  
  &::before {
    content: "👛";
    margin-right: ${({ theme }) => theme.spacing.xs};
  }
`;

const Tagline = styled.span`
  font-size: 1.5rem;
  font-weight: 400;
  color: black;
  margin-left: ${({ theme }) => theme.spacing.md};
`;

const CAText = styled.span`
  font-weight: 600;
  font-family: monospace;
  font-size: 1rem;
  color: ${({ theme }) => theme.colors.text};
  background-color: ${({ theme }) => theme.colors.lightGray};
  padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  border-radius: ${({ theme }) => theme.borderRadius.small};
`;

export default Header; 