let currentTxPage = 1;
let totalTxPages = 1;
let toastTimeout = null;

document.addEventListener('DOMContentLoaded', () => {
    checkAdminAuth();

    document.getElementById('tab-students').addEventListener('click', () => switchTab('students'));
    document.getElementById('tab-blocked').addEventListener('click', () => switchTab('blocked'));
    document.getElementById('tab-transactions').addEventListener('click', () => switchTab('transactions'));
    document.getElementById('tab-routes').addEventListener('click', () => switchTab('routes'));

    document.getElementById('admin-logout-btn').addEventListener('click', adminLogout);
    document.getElementById('prev-tx-btn').addEventListener('click', () => { if (currentTxPage > 1) loadTransactions(currentTxPage - 1); });
    document.getElementById('next-tx-btn').addEventListener('click', () => { if (currentTxPage < totalTxPages) loadTransactions(currentTxPage + 1); });
    document.getElementById('add-route-btn').addEventListener('click', addRoute);
});

function checkAdminAuth() {
    fetch('/api/session', { credentials: 'same-origin' })
        .then(res => res.json())
        .then(data => {
            if (!data.authenticated || !data.isAdmin) {
                alert('Admin privileges required. Redirecting to student login.');
                window.location.href = 'index.html';
                return;
            }
            loadStudents();
        })
        .catch(() => {
            window.location.href = 'index.html';
        });
}

function switchTab(tabName) {
    document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));

    document.getElementById(`tab-${tabName}`).classList.add('active');
    document.getElementById(`section-${tabName}`).classList.add('active');

    if (tabName === 'students') loadStudents();
    if (tabName === 'blocked') loadBlockedCards();
    if (tabName === 'transactions') loadTransactions(1);
    if (tabName === 'routes') loadRoutes();
}

function loadStudents() {
    fetch('/api/admin/students', { credentials: 'same-origin' })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                const tbody = document.querySelector('#students-table tbody');
                tbody.innerHTML = '';
                if (!data.students || data.students.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">No students registered yet.</td></tr>';
                    return;
                }
                data.students.forEach(s => {
                    const tr = document.createElement('tr');
                    const isBlocked = s.card_status === 'blocked';
                    tr.innerHTML = `
                        <td style="font-weight:600; font-family:monospace; color:#818cf8;">${s.studentId}</td>
                        <td>${s.name}</td>
                        <td style="color:var(--text-secondary);">${s.email || '-'}</td>
                        <td style="font-weight:700; color:#34d399;">${s.credits}</td>
                        <td>
                            <span class="card-status-pill ${isBlocked ? 'status-pill-blocked' : 'status-pill-active'}">
                                ${isBlocked ? 'Blocked' : 'Active'}
                            </span>
                        </td>
                        <td>
                            ${s.is_admin ? '<span style="background:rgba(139,92,246,0.2); color:#c084fc; border:1px solid rgba(139,92,246,0.4); padding:3px 8px; border-radius:12px; font-size:0.75rem; font-weight:700;">Admin</span>' : '<span style="color:var(--text-muted); font-size:0.8rem;">Student</span>'}
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            }
        });
}

function loadBlockedCards() {
    fetch('/api/admin/blocked-cards', { credentials: 'same-origin' })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                const tbody = document.querySelector('#blocked-table tbody');
                tbody.innerHTML = '';
                if (!data.blockedCards || data.blockedCards.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">No blocked cards found in system.</td></tr>';
                    return;
                }
                data.blockedCards.forEach(s => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td style="font-weight:600; font-family:monospace; color:#fb7185;">${s.studentId}</td>
                        <td>${s.name}</td>
                        <td style="color:var(--text-secondary);">${s.email || '-'}</td>
                        <td style="font-weight:700;">${s.credits}</td>
                        <td><span class="card-status-pill status-pill-blocked">Blocked</span></td>
                    `;
                    tbody.appendChild(tr);
                });
            }
        });
}

function loadTransactions(page = 1) {
    currentTxPage = page;
    fetch(`/api/admin/transactions?page=${page}&limit=10`, { credentials: 'same-origin' })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                const tbody = document.querySelector('#transactions-table tbody');
                tbody.innerHTML = '';
                totalTxPages = Math.ceil((data.total || 1) / 10) || 1;
                const pageInfo = document.getElementById('tx-page-info');
                if (pageInfo) pageInfo.textContent = `Page ${data.page} of ${totalTxPages} (${data.total} total)`;

                if (!data.transactions || data.transactions.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">No transactions recorded.</td></tr>';
                    return;
                }
                data.transactions.forEach(t => {
                    const tr = document.createElement('tr');
                    const formattedDate = t.timestamp ? new Date(t.timestamp).toLocaleString() : '-';
                    const isCreditAdd = (t.type || '').toLowerCase().includes('credit') || (t.type || '').toLowerCase().includes('deposit');

                    tr.innerHTML = `
                        <td style="color:var(--text-muted); font-size:0.8rem;">${formattedDate}</td>
                        <td style="font-family:monospace; font-weight:600;">${t.studentId}</td>
                        <td>${t.type}</td>
                        <td style="font-weight:700; color:${isCreditAdd ? '#34d399' : '#fb7185'};">
                            ${isCreditAdd ? '+' : '-'}${t.amount} credits
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            }
        });
}

function loadRoutes() {
    fetch('/api/routes', { credentials: 'same-origin' })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                const tbody = document.querySelector('#routes-table tbody');
                tbody.innerHTML = '';
                if (!data.routes || data.routes.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">No custom routes configured yet.</td></tr>';
                    return;
                }
                data.routes.forEach(r => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td style="color:var(--text-muted);">${r.id}</td>
                        <td style="font-weight:600; color:#fff;">${r.name}</td>
                        <td style="font-weight:700; color:#818cf8;">${r.fare} credits</td>
                        <td>
                            <button onclick="editRouteFare(${r.id}, ${r.fare})" class="btn-secondary action-btn-sm" style="margin-right:6px;">Edit Fare</button>
                            <button onclick="deleteRoute(${r.id})" class="btn-secondary action-btn-sm" style="color:#fb7185; border-color:rgba(244,63,94,0.3);">Delete</button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            }
        });
}

function addRoute() {
    const name = document.getElementById('new-route-name').value.trim();
    const fare = parseInt(document.getElementById('new-route-fare').value, 10);

    if (!name || isNaN(fare) || fare <= 0) {
        showStatus('Please provide a route name and positive fare.', 'error');
        return;
    }

    fetch('/api/admin/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ name, fare })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            document.getElementById('new-route-name').value = '';
            document.getElementById('new-route-fare').value = '';
            showStatus('Route added successfully!', 'success');
            loadRoutes();
        } else {
            showStatus(data.message || 'Failed to add route.', 'error');
        }
    });
}

window.editRouteFare = function(id, currentFare) {
    const newFare = prompt(`Enter new fare (credits) for route ID ${id}:`, currentFare);
    if (!newFare) return;
    const num = parseInt(newFare, 10);
    if (isNaN(num) || num <= 0) {
        showStatus('Invalid fare amount.', 'error');
        return;
    }

    fetch(`/api/admin/routes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ fare: num })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showStatus('Route fare updated!', 'success');
            loadRoutes();
        } else {
            showStatus(data.message || 'Failed to update fare.', 'error');
        }
    });
};

window.deleteRoute = function(id) {
    if (!confirm(`Are you sure you want to delete route #${id}?`)) return;

    fetch(`/api/admin/routes/${id}`, {
        method: 'DELETE',
        credentials: 'same-origin'
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showStatus('Route deleted.', 'success');
            loadRoutes();
        } else {
            showStatus(data.message || 'Failed to delete route.', 'error');
        }
    });
};

function adminLogout() {
    fetch('/api/logout', { method: 'POST', credentials: 'same-origin' })
        .then(() => {
            window.location.href = 'index.html';
        });
}

function showStatus(message, type) {
    const statusMessage = document.getElementById('statusMessage');
    if (!statusMessage) return;

    if (toastTimeout) clearTimeout(toastTimeout);

    statusMessage.textContent = message;
    statusMessage.className = type === 'error' ? 'status-error' : 'status-success';
    statusMessage.style.display = 'block';

    toastTimeout = setTimeout(() => {
        statusMessage.style.display = 'none';
    }, 3500);
}
