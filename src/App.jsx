import React, { useState, useEffect } from 'react';
import CodeView from './components/CodeView';
import AuthView from './components/AuthView';

export default function App() {
  const [view, setView] = useState('chat'); // 'chat' or 'auth'
  const [user, setUser] = useState(null); // { id, username, email } or null
  const [accessToken, setAccessToken] = useState(null); // JWT token or null
  const [isInitializing, setIsInitializing] = useState(true);

  // Sync view state directly with window location pathname
  useEffect(() => {
    const path = window.location.pathname;
    const targetView = path === '/auth' || path === '/authentication' ? 'auth' : 'chat';
    setView(targetView);
  }, []);

  // Check login status on startup via refresh token cookie
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('http://localhost:5000/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include' // Crucial to send HttpOnly cookies
        });

        if (res.ok) {
          const data = await res.json();
          if (data.status === 'success' && data.accessToken) {
            setAccessToken(data.accessToken);
            
            // Get user profile details
            const userRes = await fetch('http://localhost:5000/auth/me', {
              headers: { 'Authorization': `Bearer ${data.accessToken}` }
            });
            
            if (userRes.ok) {
              const userData = await userRes.json();
              if (userData.status === 'success') {
                setUser(userData.user);
              }
            }
          }
        }
      } catch (err) {
        console.error('Auto login check failed:', err);
      } finally {
        setIsInitializing(false);
      }
    };

    checkAuth();
  }, []);

  // Set view state and update window history URL path
  const navigateTo = (newView) => {
    const path = newView === 'auth' ? '/auth' : '/';
    window.history.pushState({ view: newView }, '', path);
    setView(newView);
  };

  const handleAuthSuccess = (token, loggedInUser) => {
    setAccessToken(token);
    setUser(loggedInUser);
    navigateTo('chat');
  };

  // Silent token refresh — called by CodeView when a request gets 401/403
  const refreshAccessToken = async () => {
    try {
      const res = await fetch('http://localhost:5000/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success' && data.accessToken) {
          setAccessToken(data.accessToken);
          return data.accessToken;
        }
      }
    } catch (err) {
      console.error('Silent token refresh failed:', err);
    }
    return null;
  };

  const handleLogout = async () => {
    try {
      await fetch('http://localhost:5000/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });
    } catch (err) {
      console.error('Logout error:', err);
    }
    setAccessToken(null);
    setUser(null);
    navigateTo('chat');
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center text-on-surface gap-4">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="font-label-sm text-label-sm opacity-60">Initializing session...</p>
      </div>
    );
  }

  return (
    <>
      {view === 'chat' ? (
        <CodeView 
          user={user} 
          accessToken={accessToken} 
          onAuthClick={() => navigateTo('auth')} 
          onLogoutClick={handleLogout}
          onRefreshToken={refreshAccessToken}
        />
      ) : (
        <AuthView 
          onBackClick={() => navigateTo('chat')} 
          onAuthSuccess={handleAuthSuccess} 
        />
      )}
    </>
  );
}
