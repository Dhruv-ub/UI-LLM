import React, { useState } from 'react';

export default function AuthView({ onBackClick, onAuthSuccess }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setIsLoading(true);

    try {
      const url = isSignUp 
        ? 'http://localhost:5000/auth/signup' 
        : 'http://localhost:5000/auth/login';

      const body = isSignUp 
        ? { username: name, email, password } 
        : { email, password };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include' // Sends cookies back and forth
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Authentication failed. Please try again.');
      }

      if (data.status === 'success' && data.accessToken) {
        onAuthSuccess(data.accessToken, data.user);
      }
    } catch (err) {
      console.error('Submit Error:', err);
      setErrorMsg(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-[100dvh] w-full flex-col overflow-y-auto bg-background text-on-surface md:flex-row">
      {/* Left Side: Branding & Features (60% Desktop) */}
      <section className="mesh-gradient relative flex w-full items-center justify-center overflow-hidden px-5 pb-10 pt-8 sm:px-8 sm:pb-12 sm:pt-10 md:min-h-[100dvh] md:w-[58%] md:px-10 md:py-12 lg:w-[60%] lg:px-14">
        {/* Background Decorative Elements */}
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary/20 rounded-full blur-[100px] animate-float"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary/10 rounded-full blur-[120px] animate-float-delayed"></div>
        <div className="relative z-10 mx-auto w-full max-w-2xl">
          {/* Brand Header */}
          <div className="mb-8 flex cursor-pointer items-center gap-4 sm:mb-10" onClick={onBackClick}>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-container to-secondary-container flex items-center justify-center shadow-lg ai-glow">
              <span className="material-symbols-outlined text-white text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                auto_awesome
              </span>
            </div>
            <span className="font-headline-md text-headline-md text-primary font-bold tracking-tight">AetherAI</span>
          </div>
          
          {/* Hero Text */}
          <h1 className="mb-4 text-on-surface font-display-lg text-display-lg-mobile md:text-display-lg">
            The next generation of{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
              intelligent collaboration.
            </span>
          </h1>

          {/* Features Bento */}
          <div className="mt-8 grid grid-cols-1 gap-3 sm:mt-10 md:grid-cols-2">
            <div className="glass-card p-md rounded-2xl flex items-start gap-md">
              <div className="bg-primary/20 p-xs rounded-lg flex items-center justify-center">
                <span className="material-symbols-outlined text-primary">insights</span>
              </div>
              <div>
                <h3 className="font-headline-md text-body-md font-bold text-on-surface">Real-time AI Insights</h3>
                <p className="text-on-surface-variant font-label-sm text-label-sm">
                  Predictive modeling that evolves with your data streams.
                </p>
              </div>
            </div>

            <div className="glass-card p-md rounded-2xl flex items-start gap-md">
              <div className="bg-secondary/20 p-xs rounded-lg flex items-center justify-center">
                <span className="material-symbols-outlined text-secondary">api</span>
              </div>
              <div>
                <h3 className="font-headline-md text-body-md font-bold text-on-surface">Seamless API Integration</h3>
                <p className="text-on-surface-variant font-label-sm text-label-sm">
                  Connect your ecosystem with 200+ native connectors.
                </p>
              </div>
            </div>

            <div className="glass-card p-md rounded-2xl flex items-start gap-md md:col-span-2">
              <div className="bg-tertiary-container/20 p-xs rounded-lg flex items-center justify-center">
                <span className="material-symbols-outlined text-tertiary">verified_user</span>
              </div>
              <div>
                <h3 className="font-headline-md text-body-md font-bold text-on-surface">Enterprise-grade Security</h3>
                <p className="text-on-surface-variant font-label-sm text-label-sm">
                  SOC2 Type II certified infrastructure with end-to-end encryption and automated threat detection.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Right Side: Login Form (40% Desktop) */}
      <section className="relative flex w-full flex-col items-center bg-surface px-4 py-8 sm:px-6 sm:py-8 md:min-h-[100dvh] md:w-[42%] md:px-8 lg:w-[40%] lg:px-10">
        
        <div className="w-full max-w-md animate-fade-in transition-all duration-700 my-auto pb-8">
          {/* COMPACT FIX: Changed padding from p-8 to p-5 sm:p-6 */}
          <div className="glass-card p-5 sm:p-6 rounded-2xl shadow-2xl relative">
            
            {/* Back to Chat button - Reduced margin-bottom */}
            <button
              onClick={onBackClick}
              type="button"
              className="mb-4 flex items-center gap-1.5 text-on-surface-variant hover:text-primary transition-colors text-label-sm font-label-sm outline-none group"
            >
              <span className="material-symbols-outlined text-[18px] group-hover:-translate-x-0.5 transition-transform">
                arrow_back
              </span>
              <span>Back to Chat</span>
            </button>

            {/* Header - Reduced margin-bottom */}
            <div className="text-center mb-5">
              <h2 className="font-headline-md text-headline-md font-bold text-on-surface mb-1">
                {isSignUp ? 'Create your account' : 'Welcome back'}
              </h2>
              <p className="text-on-surface-variant font-body-sm text-body-sm">
                {isSignUp ? 'Get started with AetherAI today' : 'Sign in to your dashboard to continue'}
              </p>
            </div>

            {/* Error Notification Alert */}
            {errorMsg && (
              <div className="mb-4 p-2.5 rounded-lg bg-error-container/30 border border-error/50 text-error text-[13px] flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">error</span>
                <span>{errorMsg}</span>
              </div>
            )}

            {/* COMPACT FIX: Tightened space-y-4 to space-y-3 */}
            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Social Auth - Reduced py-3 to py-2.5 */}
              <button
                type="button"
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-outline-variant bg-surface-container-low hover:bg-surface-container-high transition-all text-on-surface font-medium group"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                <span className="text-sm">Continue with Google</span>
              </button>

              {/* Reduced py-2 to py-1.5 */}
              <div className="relative flex items-center py-1.5">
                <div className="flex-grow border-t border-outline-variant"></div>
                <span className="flex-shrink mx-4 text-on-surface-variant text-[11px] font-semibold uppercase tracking-widest">
                  or email
                </span>
                <div className="flex-grow border-t border-outline-variant"></div>
              </div>

              {/* Form Inputs - COMPACT FIX: Tightened gap to space-y-2.5 */}
              <div className="space-y-2.5">
                {isSignUp && (
                  <div className="space-y-1">
                    <label className="block text-on-surface font-label-sm text-label-sm mb-1">Full Name</label>
                    <input
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl px-3.5 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                      placeholder="Jane Doe"
                      type="text"
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <label className="block text-on-surface font-label-sm text-label-sm mb-1">Email address</label>
                  <input
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl px-3.5 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                    placeholder="name@company.com"
                    type="email"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="block text-on-surface font-label-sm text-label-sm mb-1">Password</label>
                    {!isSignUp && (
                      <a className="text-primary font-label-sm text-label-sm hover:underline" href="#">
                        Forgot password?
                      </a>
                    )}
                  </div>
                  <input
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-surface-container-lowest border border-outline-variant rounded-xl px-3.5 py-2.5 text-sm text-on-surface placeholder:text-on-surface-variant focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all"
                    placeholder="••••••••"
                    type="password"
                  />
                </div>
              </div>

              {/* Checkbox Options */}
              {isSignUp ? (
                <div className="flex items-center gap-2 py-0.5">
                  <input
                    required
                    checked={acceptTerms}
                    onChange={(e) => setAcceptTerms(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-outline-variant bg-surface-container-lowest text-primary focus:ring-primary focus:ring-offset-background cursor-pointer"
                    id="terms"
                    type="checkbox"
                  />
                  <label className="text-on-surface-variant font-label-sm text-label-sm cursor-pointer select-none" htmlFor="terms">
                    I agree to the <a href="#" className="text-primary hover:underline">Terms</a> &amp; <a href="#" className="text-primary hover:underline">Privacy</a>
                  </label>
                </div>
              ) : (
                <div className="flex items-center gap-2 py-0.5">
                  <input
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-outline-variant bg-surface-container-lowest text-primary focus:ring-primary focus:ring-offset-background cursor-pointer"
                    id="remember"
                    type="checkbox"
                  />
                  <label className="text-on-surface-variant font-label-sm text-label-sm cursor-pointer select-none" htmlFor="remember">
                    Remember me for 30 days
                  </label>
                </div>
              )}

              {/* Submit Button - Reduced padding py-4 to py-3 */}
              <button
                disabled={isLoading}
                className="w-full py-3 px-6 bg-gradient-to-r from-primary to-primary-container text-on-primary font-bold rounded-xl shadow-lg glow-hover transform transition-all active:scale-[0.98] mt-1 flex items-center justify-center gap-2"
                type="submit"
              >
                {isLoading && (
                  <div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin"></div>
                )}
                <span>{isSignUp ? 'Create Account' : 'Sign In'}</span>
              </button>
            </form>

            {/* Bottom Text - Reduced margin mt-6 to mt-4 */}
            <p className="text-center mt-4 text-on-surface-variant font-body-sm text-sm">
              {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
              <button
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-primary font-bold hover:underline transition-all bg-transparent border-none p-0 cursor-pointer"
              >
                {isSignUp ? 'Sign in' : 'Sign up for free'}
              </button>
            </p>
          </div>

          <footer className="mt-3 flex flex-wrap justify-center gap-3 text-on-surface-variant font-label-sm text-label-sm">
            <a className="hover:text-primary transition-colors" href="#">
              Privacy Policy
            </a>
            <span className="opacity-20">•</span>
            <a className="hover:text-primary transition-colors" href="#">
              Terms of Service
            </a>
          </footer>
        </div>
      </section>
    </main>
  );
}