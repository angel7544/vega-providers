// ==========================================
// 🔐 CLERK INTEGRATION AND ROUTE PROTECTION
// ==========================================

// CONSTANT FOR THE DEVELOPER TO SET DIRECTLY (Optional fallback):
const CLERK_PUBLISHABLE_KEY = "pk_live_Y2xlcmsuZW50LmJyMzF0ZWNoLmluJA"; // Put your pk_test_... or pk_live_... key here if desired

// Cache for the retrieved key
let cachedClerkKey = null;

// Dynamically hide the page html early to prevent flashing unauthenticated content
if (!window.location.pathname.endsWith('login.html')) {
    document.documentElement.style.visibility = 'hidden';
}

// Helper to strip any accidental surrounding quotes (common in config/env variables)
function sanitizeKey(key) {
    if (!key || typeof key !== 'string') return "";
    return key.trim().replace(/^["']|["']$/g, "");
}

// Helper to validate Clerk Publishable Keys
function isValidPublishableKey(key) {
    const cleanKey = sanitizeKey(key);
    return cleanKey.startsWith('pk_test_') || cleanKey.startsWith('pk_live_');
}

// Get key from Vercel backend environment variable, developer constant fallback, or localStorage fallback
async function getPublishableKey() {
    if (cachedClerkKey && isValidPublishableKey(cachedClerkKey)) {
        return cachedClerkKey;
    }

    // 1. Try fetching from Vercel backend environment variables first (allows overriding in production)
    try {
        const response = await fetch('/api/config');
        if (response.ok) {
            const data = await response.json();
            if (isValidPublishableKey(data.clerkPublishableKey)) {
                cachedClerkKey = sanitizeKey(data.clerkPublishableKey);
                return cachedClerkKey;
            }
        }
    } catch (err) {
        console.warn("Could not fetch Clerk key from Vercel backend:", err);
    }

    // 2. Check if hardcoded developer key is set and valid (local/default fallback)
    if (isValidPublishableKey(CLERK_PUBLISHABLE_KEY)) {
        cachedClerkKey = sanitizeKey(CLERK_PUBLISHABLE_KEY);
        return cachedClerkKey;
    }

    // 3. Fallback to localStorage configuration (e.g. for local testing/manual setup)
    const localKey = localStorage.getItem('clerk_publishable_key');
    if (isValidPublishableKey(localKey)) {
        return sanitizeKey(localKey);
    }

    return "";
}

// Redirect helper
function redirectToLogin(errorType = '') {
    const loginPage = 'login.html';
    if (!window.location.pathname.endsWith(loginPage)) {
        window.location.href = `${loginPage}${errorType ? `?error=${errorType}` : ''}`;
    }
}

// Main initialization function
async function initAuth() {
    const key = await getPublishableKey();
    console.log("🔑 Clerk Publishable Key loaded:", key);
    const isLoginPage = window.location.pathname.endsWith('login.html');
    
    // 1. If key is missing, handle configuration
    if (!key) {
        if (!isLoginPage) {
            redirectToLogin('key_missing');
        } else {
            // Render configuration UI on login page
            if (typeof window.showKeyConfigUI === 'function') {
                window.showKeyConfigUI();
            }
        }
        return;
    }

    // 2. Load the script tag dynamically
    if (!window.Clerk) {
        try {
            await loadClerkScript(key);
        } catch (err) {
            console.error("Failed to load Clerk script from CDN:", err);
            if (isLoginPage && typeof window.showErrorToast === 'function') {
                window.showErrorToast("Network error loading Clerk. Check your Internet connection or Publishable Key.");
            }
            return;
        }
    }

    // 3. Load & initialize Clerk instance
    try {
        await Clerk.load();
        
        if (Clerk.user) {
            // Check email domain restriction: Only allow @gmail.com
            const email = Clerk.user.primaryEmailAddress?.emailAddress || "";
            if (!email.toLowerCase().endsWith('@gmail.com')) {
                console.warn(`User ${email} blocked due to non-gmail domain restriction.`);
                await Clerk.signOut();
                redirectToLogin('domain');
                return;
            }

            // Signed in and valid: Redirect if on login page
            if (isLoginPage) {
                window.location.href = 'index.html';
                return;
            }

            // Otherwise, make page visible and mount user account button
            document.documentElement.style.visibility = 'visible';
            setupUserButton();
        } else {
            // User is signed out: Redirect unless on login page
            if (!isLoginPage) {
                redirectToLogin();
            } else {
                // If on login page and signed out, mount the sign-in widget
                if (typeof window.mountClerkSignIn === 'function') {
                    window.mountClerkSignIn();
                }
            }
        }
    } catch (err) {
        console.error("Error initializing Clerk:", err);
        if (isLoginPage && typeof window.showErrorToast === 'function') {
            window.showErrorToast("Invalid Publishable Key. Please check the key in the settings/console.");
        }
    }
}

// Helper to extract the Frontend API URL from a Clerk Publishable Key
function getFrontendApiDomain(publishableKey) {
    const base64Part = publishableKey.replace(/^pk_(test|live)_/, '');
    try {
        const decoded = atob(base64Part);
        return decoded.split('$')[0];
    } catch (e) {
        console.error("Failed to decode Clerk publishable key base64:", e);
        return "";
    }
}

// Fetch script dynamically from public CDNs (ensures compatibility with both dev and production keys)
function loadClerkScript(publishableKey) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.browser.js`;
        script.async = true;
        script.crossOrigin = "anonymous";
        script.setAttribute('data-clerk-publishable-key', publishableKey);
        script.onload = resolve;
        script.onerror = () => {
            console.warn("Failed to load Clerk from jsdelivr, attempting unpkg fallback...");
            const fallbackScript = document.createElement('script');
            fallbackScript.src = `https://unpkg.com/@clerk/clerk-js@5/dist/clerk.browser.js`;
            fallbackScript.async = true;
            fallbackScript.crossOrigin = "anonymous";
            fallbackScript.setAttribute('data-clerk-publishable-key', publishableKey);
            fallbackScript.onload = resolve;
            fallbackScript.onerror = () => reject(new Error("Failed to load Clerk JS SDK from CDNs"));
            document.head.appendChild(fallbackScript);
        };
        document.head.appendChild(script);
    });
}

// Injects the User Button into the navigation header
function setupUserButton() {
    // 1. Try to find the Desktop header navbar actions
    let navContainer = document.querySelector('.nav-actions');
    let isMobile = false;

    // 2. Try to find Mobile header navbar container
    if (!navContainer) {
        navContainer = document.querySelector('.m-nav div[style*="display: flex"]');
        isMobile = true;
    }

    if (navContainer && !document.getElementById('clerk-user-button')) {
        const userBtnContainer = document.createElement('div');
        userBtnContainer.id = 'clerk-user-button';
        
        // Premium styles for user button integration
        userBtnContainer.style.display = 'flex';
        userBtnContainer.style.alignItems = 'center';
        userBtnContainer.style.justifyContent = 'center';
        userBtnContainer.style.marginRight = isMobile ? '4px' : '10px';
        userBtnContainer.style.marginLeft = '4px';
        userBtnContainer.style.width = '32px';
        userBtnContainer.style.height = '32px';
        userBtnContainer.style.borderRadius = '50%';
        userBtnContainer.style.overflow = 'hidden';
        userBtnContainer.style.transition = 'transform 0.2s ease, box-shadow 0.2s ease';
        
        // Subtle hover styling
        userBtnContainer.onmouseenter = () => {
            userBtnContainer.style.transform = 'scale(1.05)';
        };
        userBtnContainer.onmouseleave = () => {
            userBtnContainer.style.transform = 'scale(1)';
        };

        // Insert at the beginning of the actions row
        const target = navContainer.firstChild;
        navContainer.insertBefore(userBtnContainer, target);
        
        Clerk.mountUserButton(userBtnContainer, {
            appearance: {
                layout: {
                    shimmer: true
                },
                variables: {
                    colorPrimary: 'var(--accent)',
                    colorBackground: 'var(--surface-deep)',
                    colorText: 'var(--text-main)',
                    colorInputBackground: 'var(--surface-light)',
                    colorInputText: 'var(--text-main)',
                    colorTextSecondary: 'var(--text-muted)'
                }
            }
        });
    }
}

// Start auth flow
window.addEventListener('load', initAuth);
