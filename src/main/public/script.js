document.getElementById('shuttle-form').addEventListener('submit', function(event) {
    event.preventDefault();

    const studentId = document.getElementById('student-id').value.trim();
    const statusMessage = document.getElementById('statusMessage');

    if (!studentId) {
        statusMessage.textContent = 'Please enter a student ID.';
        statusMessage.className = 'status-error'; // Add error class
        return;
    }

    fetch('/api/pay', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ studentId: studentId }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            statusMessage.textContent = data.message;
            statusMessage.className = 'status-success'; // Add success class
        } else {
            statusMessage.textContent = data.message || 'Payment failed. Please try again.';
            statusMessage.className = 'status-error'; // Add error class
        }
    })
    .catch((error) => {
        console.error('Error:', error);
        statusMessage.textContent = 'An error occurred. Please try again later.';
        statusMessage.className = 'status-error'; // Add error class
    });

    document.getElementById('student-id').value = '';
});
