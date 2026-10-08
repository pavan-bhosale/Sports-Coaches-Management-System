/**
 * VAVA Sports Academy - Authentication UX Logic
 * Handles dynamic role switching, toast notifications, and Google Auth.
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const roleTabs = document.querySelectorAll('.role-tab');
  const roleIndicator = document.querySelector('.role-indicator');
  const selectedRoleInput = document.getElementById('selectedRole');
  const roleHint = document.getElementById('roleHint');
  const toastContainer = document.getElementById('toastContainer');

  // Role Configurations Map
  const roleConfig = {
    admin: {
      title: 'Super Admin',
      hint: 'Full cross-branch control & financial oversight',
      badgeColor: '#C9A227',
    },
    coach: {
      title: 'Branch Coach',
      hint: 'Assigned branch batches, attendance & player reports',
      badgeColor: '#06b6d4',
    },
    student: {
      title: 'Student / Parent',
      hint: 'Batch schedules, attendance history & fee receipts',
      badgeColor: '#f59e0b',
    }
  };

  // 1. Role Switcher Logic
  roleTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => {
      const role = tab.getAttribute('data-role');
      if (!roleConfig[role]) return;

      // Update active tab styling
      roleTabs.forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

      // Slide indicator pill
      if (roleIndicator) {
        roleIndicator.style.transform = `translateX(${index * 100}%)`;
      }

      // Update Hidden Input & Role Config
      selectedRoleInput.value = role;
      const config = roleConfig[role];

      // Update Hint Box
      if (roleHint) {
        const badge = roleHint.querySelector('.hint-badge');
        const text = roleHint.querySelector('.hint-text');
        if (badge) {
          badge.textContent = config.title;
          badge.style.background = config.badgeColor;
        }
        if (text) {
          text.textContent = config.hint;
        }
      }
    });
  });

  // 2. Google Identity Services Initialization
  window.handleCredentialResponse = async function(response) {
    const currentRole = selectedRoleInput?.value || 'admin';
    const config = roleConfig[currentRole];
    
    try {
      // Dynamic Environment Detection for Login Endpoint (Apache localhost, DevServer 5500, or Production)
      let verifyUrl = 'server/verify_login.php';
      if (typeof window !== 'undefined') {
        const hostname = window.location.hostname || 'localhost';
        const port = window.location.port || '';
        const pathname = window.location.pathname || '/';
        const isDevServer = port !== '' && port !== '80' && port !== '443';
        const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';

        if (isLocalHost && isDevServer) {
          const targetHost = hostname === '127.0.0.1' ? '127.0.0.1' : 'localhost';
          verifyUrl = `http://${targetHost}/VAVA_sports/server/verify_login.php`;
        } else {
          const currentDir = pathname.substring(0, pathname.lastIndexOf('/') + 1);
          verifyUrl = `${currentDir}server/verify_login.php`;
        }
      }

      const res = await fetch(verifyUrl, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          token: response.credential,
          role: currentRole
        })
      });

      let data;
      try {
        data = await res.json();
      } catch (parseErr) {
        console.error('Non-JSON response from authentication endpoint:', parseErr);
        showToast('Server error: Invalid response format from authentication service.', 'error');
        return;
      }

      if (res.ok && data && data.success) {
        // Clean any lingering session state from previous logins
        try {
          localStorage.removeItem('vava_api_base');
          localStorage.removeItem('vava_coach_id');
          localStorage.removeItem('vava_student_id');
        } catch (_) {}

        const authoritativeRole = (data.user?.role || currentRole).toLowerCase();
        const normalizedRole = (authoritativeRole === 'superadmin' || authoritativeRole === 'admin') ? 'admin' : authoritativeRole;

        localStorage.setItem('vava_token', data.token || response.credential || '');
        localStorage.setItem('vava_role', normalizedRole);
        if (data.user) {
          localStorage.setItem('vava_user', JSON.stringify(data.user));
          localStorage.setItem('vava_email', data.user.email || '');
          if (data.user.coach_id) localStorage.setItem('vava_coach_id', String(data.user.coach_id));
          if (data.user.student_id) localStorage.setItem('vava_student_id', String(data.user.student_id));
        }
        
        showToast(`Google Auth successful! Logging in as ${config.title}...`, 'success');
        
        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 1500);
      } else {
        // Show server-provided error message or descriptive status
        const errorMsg = data?.error || (res.status === 403 ? "You aren't a verified user." : (res.status === 401 ? 'Invalid Google token.' : 'Authentication failed.'));
        showToast(errorMsg, 'error');
      }
    } catch (error) {
      console.error('Auth network error:', error);
      showToast('Connection error. Please try again.', 'error');
    }
  };

  function renderGoogleSignInButton() {
    const btnContainer = document.getElementById("googleSignInBtn");
    if (!btnContainer || !window.google) return;

    // Calculate responsive width so the button never overflows the card on small screens
    // Google GSI button width accepts an integer/string between 200 and 400 pixels
    const card = document.getElementById("loginCard") || btnContainer.closest('.auth-card');
    const cardWidth = card ? card.clientWidth : window.innerWidth;
    const maxFittingWidth = Math.floor(cardWidth - 36);
    const targetWidth = Math.min(280, Math.max(200, maxFittingWidth));

    btnContainer.innerHTML = '';
    google.accounts.id.renderButton(
      btnContainer,
      { theme: "outline", size: "large", shape: "pill", text: "signin_with", width: String(targetWidth) }
    );
  }

  // Ensure google is available (script loads async)
  const initGoogleAuth = setInterval(() => {
    if (window.google) {
      clearInterval(initGoogleAuth);
      
      google.accounts.id.initialize({
        client_id: "773475002367-kfmlifn4bn181tdlts94ss2q2jmisdaa.apps.googleusercontent.com",
        callback: window.handleCredentialResponse
      });
      
      renderGoogleSignInButton();
    }
  }, 100); // Check every 100ms until loaded

  // Dynamically re-render button if viewport or card resizes
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(renderGoogleSignInButton, 200);
  });

  // 3. Toast Notification Helper
  function showToast(message, type = 'info') {
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const iconSvg = type === 'success'
      ? `<svg class="toast-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`
      : `<svg class="toast-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;

    toast.innerHTML = `
      ${iconSvg}
      <span>${message}</span>
    `;

    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 250);
    }, 3800);
  }
});
