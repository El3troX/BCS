let currentStudentId = null;
let currentHistoryPage = 1;
let totalHistoryPages = 1;
let toastTimeout = null;

document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('login-btn');
    const registerBtn = document.getElementById('register-btn');
    const payBtn = document.getElementById('pay-btn');
    const addCreditsBtn = document.getElementById('add-credits-btn');
    const viewHistoryBtn = document.getElementById('view-history-btn');
    const blockCardBtn = document.getElementById('block-card-btn');
    const requestNewCardBtn = document.getElementById('request-new-card-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const confirmAddCreditsBtn = document.getElementById('confirm-add-credits');
    const cancelAddCreditsBtn = document.getElementById('cancel-add-credits');
    const closeHistoryBtn = document.getElementById('close-history');
    const verifyOtpBtn = document.getElementById('verify-otp-button');
    const scanQrBtn = document.getElementById('scan-qr-btn');
    const stopScanBtn = document.getElementById('stop-scan-btn');
    const routeSelect = document.getElementById('route-select');
    const historyPrevBtn = document.getElementById('history-prev-btn');
    const historyNextBtn = document.getElementById('history-next-btn');
    const dashboardRouteSelect = document.getElementById('dashboard-route-select');

    if (loginBtn) loginBtn.addEventListener('click', login);
    if (registerBtn) registerBtn.addEventListener('click', registerStudent);
    if (scanQrBtn) scanQrBtn.addEventListener('click', startQrScanner);
    if (stopScanBtn) stopScanBtn.addEventListener('click', stopQrScanner);
    if (payBtn) payBtn.addEventListener('click', payForTrip);
    if (addCreditsBtn) addCreditsBtn.addEventListener('click', showAddCreditsModal);
    if (viewHistoryBtn) viewHistoryBtn.addEventListener('click', () => viewPaymentHistory(1));
    if (blockCardBtn) blockCardBtn.addEventListener('click', blockCard);
    if (requestNewCardBtn) requestNewCardBtn.addEventListener('click', requestNewCard);
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
    if (confirmAddCreditsBtn) confirmAddCreditsBtn.addEventListener('click', addCredits);
    if (cancelAddCreditsBtn) cancelAddCreditsBtn.addEventListener('click', hideAddCreditsModal);
    if (closeHistoryBtn) closeHistoryBtn.addEventListener('click', hideHistoryModal);
    if (verifyOtpBtn) verifyOtpBtn.addEventListener('click', verifyOtpAndBlock);

    if (historyPrevBtn) historyPrevBtn.addEventListener('click', () => {
        if (currentHistoryPage > 1) viewPaymentHistory(currentHistoryPage - 1);
    });
    if (historyNextBtn) historyNextBtn.addEventListener('click', () => {
        if (currentHistoryPage < totalHistoryPages) viewPaymentHistory(currentHistoryPage + 1);
    });

    if (routeSelect) {
        routeSelect.addEventListener('change', () => syncRouteSelection('route-select'));
    }
    if (dashboardRouteSelect) {
        dashboardRouteSelect.addEventListener('change', () => syncRouteSelection('dashboard-route-select'));
    }

    // Load available shuttle routes on page load
    loadRoutes();

    // Check active server session on load
    checkSession();
});

function loadRoutes() {
    fetch('/api/routes')
        .then(res => res.json())
        .then(data => {
            if (data.success && Array.isArray(data.routes)) {
                populateRouteDropdown('route-select', data.routes);
                populateRouteDropdown('dashboard-route-select', data.routes);
                updateFareDisplays();
            }
        })
        .catch(() => {});
}

function populateRouteDropdown(selectId, routes) {
    const select = document.getElementById(selectId);
    if (!select) return;

    const previousVal = select.value;
    select.innerHTML = '<option value="">Standard fare (20 credits)</option>';
    routes.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r.id;
        opt.textContent = `${r.name} (${r.fare} credits)`;
        opt.dataset.fare = r.fare;
        select.appendChild(opt);
    });

    if (previousVal) {
        select.value = previousVal;
    }
}

function syncRouteSelection(sourceId) {
    const source = document.getElementById(sourceId);
    if (!source) return;

    const val = source.value;
    const targets = ['route-select', 'dashboard-route-select'].filter(id => id !== sourceId);
    targets.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = val;
    });

    updateFareDisplays();
}

function updateFareDisplays() {
    const routeSelect = document.getElementById('route-select');
    const dashboardRouteSelect = document.getElementById('dashboard-route-select');
    const activeSelect = (dashboardRouteSelect && document.getElementById('main-section').style.display !== 'none') 
        ? dashboardRouteSelect 
        : routeSelect;

    let fare = 20;
    if (activeSelect && activeSelect.selectedIndex >= 0) {
        const opt = activeSelect.options[activeSelect.selectedIndex];
        if (opt && opt.dataset && opt.dataset.fare) {
            fare = Number(opt.dataset.fare);
        }
    }

    const loginFareDisplay = document.getElementById('login-fare-display');
    if (loginFareDisplay) loginFareDisplay.textContent = `Fare: ${fare} credits`;

    const dashboardFareDisplay = document.getElementById('dashboard-fare-display');
    if (dashboardFareDisplay) dashboardFareDisplay.textContent = `Fare: ${fare} credits`;

    const payBtnLabel = document.getElementById('pay-btn-label');
    if (payBtnLabel) payBtnLabel.textContent = `Quick Tap & Pay (${fare} credits)`;
}

let qrScannerInstance = null;

function startQrScanner() {
    if (typeof Html5Qrcode === 'undefined') {
        showStatus('QR scanner library is loading. Please try again in a moment.', 'error');
        return;
    }

    const qrContainer = document.getElementById('qr-reader-container');
    if (qrContainer) qrContainer.style.display = 'block';

    if (!qrScannerInstance) {
        qrScannerInstance = new Html5Qrcode('qr-reader');
    }

    qrScannerInstance.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
            const studentIdInput = document.getElementById('student-id');
            if (studentIdInput) {
                studentIdInput.value = decodedText.trim();
            }
            showStatus('QR scanned successfully: ' + decodedText.trim(), 'success');
            stopQrScanner();
            const pinInput = document.getElementById('student-pin');
            if (pinInput) pinInput.focus();
        },
        () => {}
    ).catch((err) => {
        console.error('Camera access error:', err);
        showStatus('Camera access unavailable. Please enter student ID manually.', 'error');
        stopQrScanner();
    });
}

function stopQrScanner() {
    const qrContainer = document.getElementById('qr-reader-container');
    if (qrContainer) qrContainer.style.display = 'none';

    if (qrScannerInstance) {
        qrScannerInstance.stop().then(() => {
            qrScannerInstance.clear();
        }).catch(() => {});
    }
}

function checkSession() {
    fetch('/api/session', {
        credentials: 'same-origin'
    })
    .then(response => response.json())
    .then(data => {
        if (data.authenticated) {
            currentStudentId = data.studentId;
            document.getElementById('student-name').textContent = data.name || data.studentId;
            const adminLink = document.getElementById('admin-link-btn');
            if (adminLink) adminLink.style.display = data.isAdmin ? 'inline-block' : 'none';
            document.getElementById('login-section').style.display = 'none';
            document.getElementById('main-section').style.display = 'block';
            loadRoutes();
        }
    })
    .catch(() => {});
}

function registerStudent() {
    const studentId = document.getElementById('student-id').value.trim();
    const pin = document.getElementById('student-pin').value.trim();

    if (!studentId) {
        showStatus('Please enter a student ID.', 'error');
        return;
    }
    if (!pin || pin.length < 4) {
        showStatus('Please enter at least a 4-digit PIN.', 'error');
        return;
    }

    const name = prompt('Enter your name (optional):') || studentId;
    const email = prompt('Enter your email (optional):') || `${studentId}@vitstudent.ac.in`;

    fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ studentId, pin, name, email })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showStatus(data.message || 'Registration successful! You can now log in.', 'success');
        } else {
            showStatus(data.message || 'Registration failed.', 'error');
        }
    })
    .catch((error) => {
        console.error('Error:', error);
        showStatus('An error occurred during registration.', 'error');
    });
}

function login() {
    const studentId = document.getElementById('student-id').value.trim();
    const pin = document.getElementById('student-pin').value.trim();

    if (!studentId) {
        showStatus('Please enter a student ID.', 'error');
        return;
    }

    fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ studentId: studentId, pin: pin }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            currentStudentId = studentId;
            document.getElementById('student-name').textContent = data.name || studentId;
            document.getElementById('credit-balance').textContent = data.newCredits;
            const adminLink = document.getElementById('admin-link-btn');
            if (adminLink) adminLink.style.display = data.isAdmin ? 'inline-block' : 'none';
            document.getElementById('login-section').style.display = 'none';
            document.getElementById('main-section').style.display = 'block';
            loadRoutes();
            showStatus('Welcome back, ' + (data.name || studentId) + '!', 'success');
        } else {
            showStatus(data.message || 'Login failed. Please try again.', 'error');
        }
    })
    .catch((error) => {
        console.error('Error:', error);
        showStatus('An error occurred. Please try again later.', 'error');
    });
}

function payForTrip() {
    let pin = document.getElementById('student-pin') ? document.getElementById('student-pin').value.trim() : '';

    if (!pin) {
        pin = prompt('Please enter your 4-digit PIN to authorize payment:');
        if (!pin) {
            showStatus('Payment cancelled. PIN is required.', 'error');
            return;
        }
    }

    const dashboardRouteSelect = document.getElementById('dashboard-route-select');
    const loginRouteSelect = document.getElementById('route-select');
    const activeSelect = (dashboardRouteSelect && document.getElementById('main-section').style.display !== 'none')
        ? dashboardRouteSelect
        : loginRouteSelect;

    const rawRouteVal = activeSelect ? activeSelect.value : '';
    const chosenRouteId = rawRouteVal ? Number(rawRouteVal) : undefined;

    const requestBody = { pin: pin };
    if (chosenRouteId) {
        requestBody.routeId = chosenRouteId;
    }

    fetch('/api/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(requestBody),
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(errData => { throw new Error(errData.message || `HTTP error ${response.status}`); });
        }
        return response.json();
    })
    .then(data => {
        if (data.success) {
            showStatus(data.message, 'success');
            document.getElementById('credit-balance').textContent = data.newCredits;
        } else {
            showStatus(data.message || 'Payment failed. Please try again.', 'error');
        }
    })
    .catch((error) => {
        console.error('Error:', error);
        showStatus(`Payment failed: ${error.message}`, 'error');
    });
}

function triggerDashboardPay() {
    payForTrip();
}

function toggleOtpSection() {
    const sec = document.getElementById('otp-section');
    if (!sec) return;
    sec.style.display = sec.style.display === 'none' ? 'block' : 'none';
}

function setPresetCredit(amount) {
    const input = document.getElementById('credits-amount');
    if (input) input.value = amount;
}

function addCredits() {
    const credits = parseInt(document.getElementById('credits-amount').value, 10);
    let pin = document.getElementById('credits-pin') ? document.getElementById('credits-pin').value.trim() : '';

    if (isNaN(credits) || credits < 1) {
        showStatus('Please enter a valid amount of credits.', 'error');
        return;
    }

    if (!pin) {
        pin = prompt('Please enter your PIN to confirm adding credits:');
        if (!pin) {
            showStatus('Add credits cancelled. PIN is required.', 'error');
            return;
        }
    }

    fetch('/api/add-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ credits: credits, pin: pin }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            document.getElementById('credit-balance').textContent = data.newCredits;
            showStatus(data.message, 'success');
            hideAddCreditsModal();
            document.getElementById('credits-amount').value = '';
            if (document.getElementById('credits-pin')) document.getElementById('credits-pin').value = '';
        } else {
            showStatus(data.message || 'Failed to add credits. Please try again.', 'error');
        }
    })
    .catch((error) => {
        console.error('Error:', error);
        showStatus('An error occurred. Please try again later.', 'error');
    });
}

function showAddCreditsModal() {
    const modal = document.getElementById('add-credits-modal');
    if (modal) modal.style.display = 'flex';
}

function hideAddCreditsModal() {
    const modal = document.getElementById('add-credits-modal');
    if (modal) modal.style.display = 'none';
}

function viewPaymentHistory(page = 1) {
    currentHistoryPage = page;
    fetch(`/api/payment-history?page=${page}&limit=10`, {
        credentials: 'same-origin'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            const historyList = document.getElementById('history-list');
            historyList.innerHTML = '';
            totalHistoryPages = Math.ceil((data.total || 1) / 10) || 1;
            const pageInfo = document.getElementById('history-page-info');
            if (pageInfo) pageInfo.textContent = `Page ${data.page} of ${totalHistoryPages} (${data.total} total)`;

            if (!data.history || data.history.length === 0) {
                historyList.innerHTML = '<li style="justify-content:center; color:var(--text-muted);">No ride or payment history yet.</li>';
            } else {
                data.history.forEach(item => {
                    const li = document.createElement('li');
                    const isCreditAdd = (item.type || '').toLowerCase().includes('credit') || (item.type || '').toLowerCase().includes('deposit');
                    const formattedDate = item.timestamp ? new Date(item.timestamp).toLocaleString() : '-';

                    li.innerHTML = `
                        <div class="history-item-details">
                            <span class="history-type">${item.type}</span>
                            <span class="history-time">${formattedDate}</span>
                        </div>
                        <div class="history-amount ${isCreditAdd ? 'amount-add' : 'amount-deduct'}">
                            ${isCreditAdd ? '+' : '-'}${item.amount} credits
                        </div>
                    `;
                    historyList.appendChild(li);
                });
            }
            const modal = document.getElementById('history-modal');
            if (modal) modal.style.display = 'flex';
        } else {
            showStatus(data.message || 'Failed to fetch payment history.', 'error');
        }
    })
    .catch((error) => {
        console.error('Error:', error);
        showStatus('An error occurred while loading history.', 'error');
    });
}

function hideHistoryModal() {
    const modal = document.getElementById('history-modal');
    if (modal) modal.style.display = 'none';
}

function blockCard() {
    if (!confirm('Are you sure you want to block your card? This will disable shuttle payments immediately.')) {
        return;
    }

    const pin = prompt('Please enter your PIN to authorize blocking your card:');
    if (!pin) {
        showStatus('Card block cancelled. PIN is required.', 'error');
        return;
    }

    fetch('/api/block-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ pin: pin }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            document.getElementById('otp-section').style.display = 'block';
            showStatus(data.message, 'success');
        } else {
            showStatus(data.message || 'Failed to block card. Please try again.', 'error');
        }
    })
    .catch((error) => {
        console.error('Error:', error);
        showStatus('An error occurred. Please try again later.', 'error');
    });
}

function verifyOtpAndBlock() {
    const otpInput = document.getElementById('otp-input').value.trim();
    if (!otpInput) {
        showStatus('Please enter an OTP.', 'error');
        return;
    }

    fetch('/api/verify-otp-and-block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ otp: otpInput }),
    })
    .then(response => response.json())
    .then(data => {
        const otpStatusDiv = document.getElementById('otp-status');
        if (data.success) {
            otpStatusDiv.textContent = 'OTP verified! Your card is now blocked.';
            otpStatusDiv.style.color = '#34d399';

            const badge = document.getElementById('card-status-badge');
            if (badge) {
                badge.className = 'card-status-pill status-pill-blocked';
                badge.innerHTML = 'Blocked';
            }
            showStatus('Card blocked successfully.', 'success');
        } else {
            otpStatusDiv.textContent = data.message || 'Invalid OTP. Please try again.';
            otpStatusDiv.style.color = '#fb7185';
            showStatus(data.message || 'OTP verification failed.', 'error');
        }
    })
    .catch((error) => {
        console.error('Error:', error);
        document.getElementById('otp-status').textContent = 'An error occurred during OTP verification.';
    });
}

function requestNewCard() {
    fetch('/api/request-new-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showStatus(data.message, 'success');
            const otp = prompt(data.message + '\nEnter verification OTP:');
            if (!otp) {
                showStatus('Card reactivation cancelled.', 'error');
                return;
            }

            fetch('/api/verify-otp-and-request-new-card', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ otp: otp.trim() }),
            })
            .then(res => res.json())
            .then(verifyData => {
                if (verifyData.success) {
                    showStatus(verifyData.message, 'success');
                    const badge = document.getElementById('card-status-badge');
                    if (badge) {
                        badge.className = 'card-status-pill status-pill-active';
                        badge.innerHTML = '<span class="status-dot" style="width: 6px; height: 6px;"></span> Active';
                    }
                } else {
                    showStatus('Error renewing card: ' + verifyData.message, 'error');
                }
            })
            .catch(err => {
                console.error('Error verifying OTP for new card:', err);
                showStatus('An error occurred during OTP verification.', 'error');
            });
        } else {
            showStatus('Error requesting new card: ' + data.message, 'error');
        }
    })
    .catch((error) => {
        console.error('Error:', error);
        showStatus('An error occurred. Please try again later.', 'error');
    });
}

function logout() {
    fetch('/api/logout', {
        method: 'POST',
        credentials: 'same-origin'
    })
    .then(() => {
        currentStudentId = null;
        document.getElementById('login-section').style.display = 'block';
        document.getElementById('main-section').style.display = 'none';
        document.getElementById('student-id').value = '';
        if (document.getElementById('student-pin')) {
            document.getElementById('student-pin').value = '';
        }
        document.getElementById('student-name').textContent = '';
        document.getElementById('credit-balance').textContent = '0';
        showStatus('Signed out successfully.', 'success');
    })
    .catch((error) => {
        console.error('Error logging out:', error);
        showStatus('Signed out.', 'info');
    });
}

function showStatus(message, type) {
    const statusMessage = document.getElementById('statusMessage');
    if (!statusMessage) return;

    if (toastTimeout) {
        clearTimeout(toastTimeout);
    }

    statusMessage.textContent = message;
    statusMessage.className = type === 'error' ? 'status-error' : 'status-success';
    statusMessage.style.display = 'block';

    toastTimeout = setTimeout(() => {
        statusMessage.style.display = 'none';
    }, 3500);
}
