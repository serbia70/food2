import { useState, useEffect } from 'preact/hooks';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: any) => void;
          prompt: (callback?: (notification: any) => void) => void;
          renderButton: (element: HTMLElement | null, options: any) => void;
        };
      };
    };
  }
}

interface GoogleLoginButtonProps {
  onSuccess?: (user: any) => void;
  onError?: (error: string) => void;
}

export default function GoogleLoginButton({ onSuccess, onError }: GoogleLoginButtonProps) {
    const [sdkLoaded, setSdkLoaded] = useState(false);
    const CLIENT_ID = '115306160524-ln5junrf3fsfp4d3a74chat7m5qj9fdd.apps.googleusercontent.com';

    useEffect(() => {
        const handleCredentialResponse = async (response: any) => {
            try {
                const res = await fetch('/api/auth/google', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'google_login', token: response.credential })
                });
                const data = await res.json();
                if (data.success) {
                    localStorage.setItem('user_session', data.sessionToken);
                    localStorage.setItem('user_info', JSON.stringify(data.user));
                    onSuccess?.(data.user);
                    window.location.reload();
                } else {
                    onError?.(data.error);
                }
            } catch (e: any) { 
                console.error('Google verification error:', e);
                onError?.(e.message); 
            }
        };

        const initGoogle = () => {
            if (window.google?.accounts) {
                window.google.accounts.id.initialize({
                    client_id: CLIENT_ID,
                    callback: handleCredentialResponse,
                    auto_select: true,
                    itp_support: true
                });
                const btnContainer = document.getElementById('google-signin-target');
                if (btnContainer) {
                    window.google.accounts.id.renderButton(
                        btnContainer,
                        { type: 'standard', theme: 'outline', size: 'large', text: 'signin_with', shape: 'rectangular', width: 280 }
                    );
                }
                window.google.accounts.id.prompt();
                setSdkLoaded(true);
            }
        };

        if (window.google?.accounts) {
            initGoogle();
        } else {
            const script = document.createElement('script');
            script.src = 'https://accounts.google.com/gsi/client';
            script.async = true;
            script.defer = true;
            script.onload = initGoogle;
            document.head.appendChild(script);
        }
    }, []);

    return (
        <div style={{ minHeight: '44px', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
            <div id="google-signin-target"></div>
            {!sdkLoaded && <div style={{ color: '#999', fontSize: '12px', marginTop: '10px' }}>Loading Google...</div>}
        </div>
    );
}
