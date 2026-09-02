function switchForm(type) {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const forgotForm = document.getElementById('forgotForm');
  const loginBtn = document.getElementById('tabLoginBtn');
  const regBtn = document.getElementById('tabRegisterBtn');

  loginForm.classList.add('hidden');
  registerForm.classList.add('hidden');
  if (forgotForm) forgotForm.classList.add('hidden');

  if (type === 'login') {
    loginForm.classList.remove('hidden');
    loginBtn.className = 'flex-1 py-2 border-b-2 border-blue-500 text-blue-400';
    regBtn.className = 'flex-1 py-2 border-b-2 border-transparent text-slate-400 hover:text-slate-200';
  } else if (type === 'register') {
    registerForm.classList.remove('hidden');
    regBtn.className = 'flex-1 py-2 border-b-2 border-blue-500 text-blue-400';
    loginBtn.className = 'flex-1 py-2 border-b-2 border-transparent text-slate-400 hover:text-slate-200';
  } else if (type === 'forgot' && forgotForm) {
    forgotForm.classList.remove('hidden');
    loginBtn.className = 'flex-1 py-2 border-b-2 border-transparent text-slate-400 hover:text-slate-200';
    regBtn.className = 'flex-1 py-2 border-b-2 border-transparent text-slate-400 hover:text-slate-200';
    const loginEmail = document.getElementById('loginEmail');
    const forgotEmail = document.getElementById('forgotEmail');
    if (loginEmail && forgotEmail && loginEmail.value && !forgotEmail.value) {
      forgotEmail.value = loginEmail.value;
    }
  }
}

function showForgotPassword() {
  switchForm('forgot');
}

function showAlert(msg, isSuccess = false) {
  const box = document.getElementById('alertBox');
  box.classList.remove('hidden', 'bg-red-900/50', 'text-red-200', 'bg-emerald-900/50', 'text-emerald-200');
  box.classList.add(isSuccess ? 'bg-emerald-900/50' : 'bg-red-900/50');
  box.classList.add(isSuccess ? 'text-emerald-200' : 'text-red-200');
  box.innerText = msg || (isSuccess ? 'Operation completed successfully.' : 'Something went wrong. Please try again.');
}

async function handleLogin(e) {
  e.preventDefault();
  try {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: document.getElementById('loginEmail').value,
        password: document.getElementById('loginPassword').value
      })
    });

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    window.location.href = '/dashboard.html';
  } catch (err) {
    showAlert(err.message, false);
    if (err.message && err.message.toLowerCase().includes('verify')) {
      document.getElementById('resendVerificationBox').classList.remove('hidden');
    }
  }
}

async function handleResendVerification() {
  const email = document.getElementById('loginEmail').value;
  if (!email) {
    showAlert('Enter your email address first, then click resend.', false);
    return;
  }

  try {
    const data = await apiFetch('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
    showAlert(data.message, true);
  } catch (err) {
    showAlert(err.message, false);
  }
}

async function handleForgotPassword(e) {
  e.preventDefault();
  const form = document.getElementById('forgotForm');
  const emailInput = document.getElementById('forgotEmail');
  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn?.disabled) return;

  const originalLabel = submitBtn?.textContent || 'Send Reset Link';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';
  }
  if (emailInput) emailInput.disabled = true;

  try {
    const data = await apiFetch('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({
        email: emailInput.value
      })
    });
    showAlert(data.message, true);
    form.reset();
  } catch (err) {
    showAlert(err.message, false);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
    if (emailInput) emailInput.disabled = false;
  }
}

async function handleRegister(e) {
  e.preventDefault();
  try {
    const data = await apiFetch('/auth/register-head-coach', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('regName').value,
        teamName: document.getElementById('regTeamName').value,
        email: document.getElementById('regEmail').value,
        password: document.getElementById('regPassword').value
      })
    });

    showAlert(data.message, data.emailSent !== false);
    document.getElementById('registerForm').reset();
  } catch (err) {
    showAlert(err.message, false);
  }
}

(function openRegisterFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const hash = (window.location.hash || '').replace('#', '').toLowerCase();
  if (hash === 'register' || params.get('tab') === 'register' || params.has('register')) {
    switchForm('register');
  } else if (hash === 'forgot' || params.get('tab') === 'forgot') {
    switchForm('forgot');
  }
})();
