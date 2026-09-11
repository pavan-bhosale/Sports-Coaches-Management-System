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
      badgeColor: '#10b981',
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
      const res = await fetch('http://localhost/VAVA_sports/server/verify_login.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          token: response.credential,
          role: currentRole
        })
      });

      const data = await res.json();

      if (res.ok) {
        // Save token, role, and user object to localStorage
        localStorage.setItem('vava_token', data.token || response.credential || '');
        localStorage.setItem('vava_role', currentRole);
        if (data.user) {
          localStorage.setItem('vava_user', JSON.stringify(data.user));
          localStorage.setItem('vava_email', data.user.email || '');
        }
        
        showToast(`Google Auth successful! Logging in as ${config.title}...`, 'success');
        
        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 1500);
      } else {
        // Show error message
        showToast(data.error || 'Authentication failed', 'error');
      }
    } catch (error) {
      console.error('Auth error:', error);
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
