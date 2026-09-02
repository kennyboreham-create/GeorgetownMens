/**
 * Firebase Auth + Firestore persistence for Season Planner.
 * Each user reads/writes only their own data under users/{uid}/.
 */
(function () {
    const PROFILE_COLLECTION = 'users';
    const PLANNER_DOC = 'planner';
    const SAVE_DEBOUNCE_MS = 800;

    let db = null;
    let auth = null;
    let currentUser = null;
    let saveTimer = null;
    let isLoadingPlanner = false;

    function plannerRef(uid) {
        return db.collection(PROFILE_COLLECTION).doc(uid).collection('data').doc(PLANNER_DOC);
    }

    function profileRef(uid) {
        return db.collection(PROFILE_COLLECTION).doc(uid);
    }

    function setAuthGateVisible(visible) {
        const gate = document.getElementById('auth-gate');
        const appRoot = document.getElementById('app-root');
        if (!gate || !appRoot) return;

        if (visible) {
            gate.classList.remove('hidden');
            appRoot.classList.add('hidden');
        } else {
            gate.classList.add('hidden');
            appRoot.classList.remove('hidden');
        }
    }

    function setAuthError(message) {
        const el = document.getElementById('auth-error');
        if (!el) return;
        if (message) {
            el.textContent = message;
            el.classList.remove('hidden');
        } else {
            el.textContent = '';
            el.classList.add('hidden');
        }
    }

    function setAuthLoading(loading) {
        const buttons = document.querySelectorAll('[data-auth-submit]');
        buttons.forEach((btn) => {
            btn.disabled = loading;
        });
    }

    function updateUserHeader(user, profile) {
        const nameEl = document.getElementById('user-display-name');
        const emailEl = document.getElementById('user-email');
        if (!nameEl || !emailEl) return;

        const displayName = profile?.displayName || user.displayName || 'Coach';
        nameEl.textContent = displayName;
        emailEl.textContent = user.email || '';
    }

    async function loadUserProfile(uid) {
        const snap = await profileRef(uid).get();
        return snap.exists ? snap.data() : null;
    }

    async function createUserProfile(user, displayName) {
        const data = {
            displayName: displayName.trim(),
            email: user.email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        await profileRef(user.uid).set(data, { merge: true });
        return data;
    }

    async function loadPlannerData(uid) {
        const snap = await plannerRef(uid).get();
        return snap.exists ? snap.data() : null;
    }

    async function savePlannerData(uid, state) {
        const payload = {
            seasonConfig: state.seasonConfig,
            weeksData: state.weeksData,
            monthlyGoals: state.monthlyGoals,
            events: state.events,
            activeWeekIndex: state.activeWeekIndex,
            calendarSubView: state.calendarSubView,
            calendarCurrentDate: state.calendarCurrentDate,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        await plannerRef(uid).set(payload, { merge: true });
    }

    window.PlannerBackend = {
        init(config) {
            if (!config || !config.apiKey || config.apiKey === 'YOUR_API_KEY') {
                console.error('Firebase config missing. Copy js/firebase-config.example.js to js/firebase-config.js');
                setAuthError('Firebase is not configured. See README for setup steps.');
                setAuthGateVisible(true);
                return;
            }

            if (!firebase.apps.length) {
                firebase.initializeApp(config);
            }
            db = firebase.firestore();
            auth = firebase.auth();

            auth.onAuthStateChanged(async (user) => {
                currentUser = user;
                if (!user) {
                    setAuthGateVisible(true);
                    setAuthError('');
                    return;
                }

                try {
                    isLoadingPlanner = true;
                    const profile = await loadUserProfile(user.uid);
                    const planner = await loadPlannerData(user.uid);

                    updateUserHeader(user, profile);

                    if (typeof window.onPlannerLoaded === 'function') {
                        window.onPlannerLoaded(planner);
                    }

                    setAuthGateVisible(false);
                } catch (err) {
                    console.error('Failed to load planner:', err);
                    setAuthError('Could not load your planner. Please try again.');
                    setAuthGateVisible(true);
                } finally {
                    isLoadingPlanner = false;
                }
            });
        },

        scheduleSave() {
            if (!currentUser || isLoadingPlanner || typeof window.getPlannerState !== 'function') {
                return;
            }

            clearTimeout(saveTimer);
            saveTimer = setTimeout(async () => {
                try {
                    const state = window.getPlannerState();
                    await savePlannerData(currentUser.uid, state);
                    this.showSaveStatus('saved');
                } catch (err) {
                    console.error('Save failed:', err);
                    this.showSaveStatus('error');
                }
            }, SAVE_DEBOUNCE_MS);
        },

        showSaveStatus(status) {
            const el = document.getElementById('save-status');
            if (!el) return;

            if (status === 'saved') {
                el.textContent = 'Saved';
                el.className = 'text-[10px] text-emerald-400 font-medium';
            } else if (status === 'saving') {
                el.textContent = 'Saving…';
                el.className = 'text-[10px] text-slate-400 font-medium';
            } else {
                el.textContent = 'Save failed';
                el.className = 'text-[10px] text-rose-400 font-medium';
            }

            if (status === 'saved') {
                setTimeout(() => {
                    if (el.textContent === 'Saved') el.textContent = '';
                }, 2000);
            }
        },

        async signUp(email, password, displayName) {
            setAuthError('');
            setAuthLoading(true);
            try {
                const cred = await auth.createUserWithEmailAndPassword(email, password);
                await cred.user.updateProfile({ displayName: displayName.trim() });
                await createUserProfile(cred.user, displayName);
            } catch (err) {
                setAuthError(friendlyAuthError(err));
                throw err;
            } finally {
                setAuthLoading(false);
            }
        },

        async signIn(email, password) {
            setAuthError('');
            setAuthLoading(true);
            try {
                await auth.signInWithEmailAndPassword(email, password);
            } catch (err) {
                setAuthError(friendlyAuthError(err));
                throw err;
            } finally {
                setAuthLoading(false);
            }
        },

        async signOut() {
            await auth.signOut();
        }
    };

    function friendlyAuthError(err) {
        const code = err?.code || '';
        const map = {
            'auth/email-already-in-use': 'That email is already registered. Try signing in.',
            'auth/invalid-email': 'Please enter a valid email address.',
            'auth/weak-password': 'Password must be at least 6 characters.',
            'auth/user-not-found': 'No account found with that email.',
            'auth/wrong-password': 'Incorrect password.',
            'auth/invalid-credential': 'Invalid email or password.',
            'auth/too-many-requests': 'Too many attempts. Please wait and try again.'
        };
        return map[code] || err.message || 'Authentication failed.';
    }

    window.switchAuthMode = function (mode) {
        const signInForm = document.getElementById('auth-signin-form');
        const signUpForm = document.getElementById('auth-signup-form');
        const signInTab = document.getElementById('auth-tab-signin');
        const signUpTab = document.getElementById('auth-tab-signup');
        setAuthError('');

        if (mode === 'signup') {
            signInForm.classList.add('hidden');
            signUpForm.classList.remove('hidden');
            signInTab.className = 'flex-1 py-2 text-sm font-semibold text-slate-400';
            signUpTab.className = 'flex-1 py-2 text-sm font-semibold text-indigo-600 border-b-2 border-indigo-600';
        } else {
            signUpForm.classList.add('hidden');
            signInForm.classList.remove('hidden');
            signUpTab.className = 'flex-1 py-2 text-sm font-semibold text-slate-400';
            signInTab.className = 'flex-1 py-2 text-sm font-semibold text-indigo-600 border-b-2 border-indigo-600';
        }
    };

    window.handleSignIn = async function (event) {
        event.preventDefault();
        const email = document.getElementById('signin-email').value.trim();
        const password = document.getElementById('signin-password').value;
        await window.PlannerBackend.signIn(email, password);
    };

    window.handleSignUp = async function (event) {
        event.preventDefault();
        const displayName = document.getElementById('signup-name').value.trim();
        const email = document.getElementById('signup-email').value.trim();
        const password = document.getElementById('signup-password').value;

        if (!displayName) {
            setAuthError('Please enter your name.');
            return;
        }

        await window.PlannerBackend.signUp(email, password, displayName);
    };

    window.handleSignOut = async function () {
        await window.PlannerBackend.signOut();
    };
})();
