const SECURE_TOKEN = "869f282d-b735-4c97-95e6-a3d300869d3c";
const MAIL_TO = 'shreedentalclinicchimur@gmail.com';
const MAIL_FROM = "tarunpal13982@gmail.com";

const cscriptURL = 'https://script.google.com/macros/s/AKfycbxF4n6ZhGXh2M3TyojJ6QNOkvxp0VvyRifwkWhpz9mSx2VynHgfTyEmVvLLIfD_2yh_/exec';
const ascriptURL = 'https://script.google.com/macros/s/AKfycbxlqktA9WM15sPor6yeOihbc0z6BkjfikjnDt74zd56FjoGITswr3rkEQvWK4GogWQOEw/exec';

const ERROR_MSG = "Sorry, something went wrong. Please try again or call us at 93403 89430.";

// Prevent user input from injecting HTML into the notification email
function esc(value) {
    const d = document.createElement('div');
    d.textContent = value;
    return d.innerHTML;
}

function showStatus(form, type, text) {
    const status = form.querySelector('.form-status');
    status.className = 'form-status is-' + type;
    status.textContent = text;
}

function handleForm(form, { url, subject, heading, fields, success, validate }) {
    const button = form.querySelector('button[type="submit"]');
    const label = button.textContent;

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (button.disabled) return;

        if (validate) validate();
        form.classList.add('was-validated');
        if (!form.checkValidity()) {
            const firstInvalid = form.querySelector(':invalid');
            if (firstInvalid) firstInvalid.focus();
            return;
        }

        button.disabled = true;
        button.textContent = 'Sending...';
        form.querySelector('.form-status').className = 'form-status';
        form.querySelector('.form-status').textContent = '';

        const body = (heading ? heading + '<br>' : '') +
            fields.map(([name, id]) => `<b>${name}:</b> ${esc(document.getElementById(id).value || '-')}<br>`).join('');
        const name = document.getElementById(fields[0][1]).value;

        // Email is a best-effort notification; the Google Sheet submission is the source of truth
        if (typeof Email !== 'undefined') {
            Email.send({
                SecureToken: SECURE_TOKEN,
                To: MAIL_TO,
                From: MAIL_FROM,
                Subject: subject + name,
                Body: body
            });
        }

        fetch(url, { method: 'POST', body: new FormData(form) })
            .then(async (res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                // Apps Script sheet handlers usually reply {"result":"success"|"error"}
                const text = await res.text();
                let data = null;
                try { data = JSON.parse(text); } catch (_) { /* non-JSON reply: rely on HTTP status */ }
                if (data && data.result === 'error') throw new Error(data.error || 'Script error');
                form.reset();
                form.classList.remove('was-validated');
                if (form.onAfterReset) form.onAfterReset();
                showStatus(form, 'success', success);
            })
            .catch(() => showStatus(form, 'error', ERROR_MSG))
            .finally(() => {
                button.disabled = false;
                button.textContent = label;
            });
    });
}

// ---------- Appointment: only allow dates when the chosen clinic is open ----------
const aform = document.getElementById('appointment-form');
const aclinic = document.getElementById('aclinic');
const adate = document.getElementById('adate');
const adateHint = document.getElementById('adate-hint');
const adateError = document.getElementById('adate-error');
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Disallow past dates (local time, not UTC)
const now = new Date();
adate.min = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

function validateAppointmentDate() {
    adate.setCustomValidity('');
    adateError.textContent = 'Please choose a date.';
    const option = aclinic.selectedOptions[0];
    if (!adate.value || !option || !option.value) return;

    const [y, m, d] = adate.value.split('-').map(Number);
    const day = new Date(y, m - 1, d).getDay();
    const openDays = option.dataset.days.split(',').map(Number);
    if (!openDays.includes(day)) {
        const msg = `Our ${option.value} clinic is closed on ${DAY_NAMES[day]}s. ${option.dataset.hint}`;
        adate.setCustomValidity(msg);
        adateError.textContent = msg;
    } else if (adate.validity.rangeUnderflow) {
        adateError.textContent = 'Please choose today or a future date.';
    }
}

function updateClinicHint() {
    const option = aclinic.selectedOptions[0];
    adateHint.textContent = option && option.value ? option.dataset.hint : '';
    validateAppointmentDate();
}

aclinic.addEventListener('change', updateClinicHint);
adate.addEventListener('change', validateAppointmentDate);
aform.onAfterReset = updateClinicHint;

handleForm(aform, {
    url: ascriptURL,
    subject: "New Appointment of ",
    heading: "Book an appointment:",
    fields: [['Name', 'aname'], ['Phone', 'aphone'], ['Clinic', 'aclinic'], ['Date', 'adate'], ['Email', 'aemail']],
    success: "Thank you! Your appointment request has been received. We will call you soon to confirm the time.",
    validate: validateAppointmentDate
});

handleForm(document.getElementById('contact-form'), {
    url: cscriptURL,
    subject: "New query/feedback from ",
    fields: [['Name', 'cname'], ['Phone', 'cphone'], ['Email', 'cemail'], ['Feedback', 'cfeedback']],
    success: "Thank you for contacting us! We will get back to you soon."
});
