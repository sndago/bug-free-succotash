(function () {
  'use strict';

  var backdrop, okBtn, pendingForm;

  var STYLES = [
    '#cm-bd{display:none;position:fixed;inset:0;background:rgba(15,23,42,.6);z-index:9999;',
    'align-items:center;justify-content:center;padding:1rem;backdrop-filter:blur(3px);}',
    '#cm-bd.cm-open{display:flex;}',
    '#cm-box{background:#fff;border-radius:16px;padding:2rem 2rem 1.75rem;max-width:420px;width:100%;',
    'box-shadow:0 24px 64px rgba(0,0,0,.18),0 4px 16px rgba(0,0,0,.08);',
    'animation:cmIn .2s cubic-bezier(.34,1.4,.64,1);text-align:center;}',
    '#cm-icon{width:56px;height:56px;border-radius:50%;display:flex;align-items:center;',
    'justify-content:center;margin:0 auto 1.25rem;}',
    '#cm-icon.cm-d{background:#fee2e2;}',
    '#cm-icon.cm-p{background:#ede9fe;}',
    '#cm-icon.cm-w{background:#fef3c7;}',
    '#cm-title{font-size:1.05rem;font-weight:700;color:#0f172a;margin:0 0 .5rem;line-height:1.3;}',
    '#cm-msg{font-size:.875rem;color:#64748b;margin:0 0 1.75rem;line-height:1.6;}',
    '.cm-btns{display:flex;gap:.625rem;}',
    '.cm-btns button{flex:1;height:2.5rem;border-radius:.625rem;font-size:.875rem;font-weight:600;',
    'cursor:pointer;font-family:inherit;transition:background .15s,box-shadow .15s,transform .1s;border:none;}',
    '.cm-btns button:active{transform:translateY(1px);}',
    '#cm-cancel{background:#f1f5f9;color:#475569;border:1.5px solid #e2e8f0!important;}',
    '#cm-cancel:hover{background:#e2e8f0;}',
    '#cm-ok.cm-danger{background:#ef4444;color:#fff;box-shadow:0 2px 8px rgba(239,68,68,.3);}',
    '#cm-ok.cm-danger:hover{background:#dc2626;}',
    '#cm-ok.cm-primary{background:#6366f1;color:#fff;box-shadow:0 2px 8px rgba(99,102,241,.3);}',
    '#cm-ok.cm-primary:hover{background:#4f46e5;}',
    '#cm-ok.cm-warning{background:#f59e0b;color:#fff;box-shadow:0 2px 8px rgba(245,158,11,.3);}',
    '#cm-ok.cm-warning:hover{background:#d97706;}',
    '@keyframes cmIn{from{opacity:0;transform:scale(.9) translateY(8px)}to{opacity:1;transform:none}}',
    '@media(max-width:480px){#cm-box{padding:1.5rem 1.25rem 1.25rem;}.cm-btns{flex-direction:column-reverse;}}',
  ].join('');

  var ICONS = {
    danger: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><circle cx="12" cy="17" r=".5" fill="#ef4444"/></svg>',
    primary: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 8 12 12"/><circle cx="12" cy="16" r=".5" fill="#6366f1"/></svg>',
    warning: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 8 12 12"/><circle cx="12" cy="16" r=".5" fill="#f59e0b"/></svg>',
  };

  function build() {
    var s = document.createElement('style');
    s.textContent = STYLES;
    document.head.appendChild(s);

    backdrop = document.createElement('div');
    backdrop.id = 'cm-bd';
    backdrop.innerHTML = [
      '<div id="cm-box" role="dialog" aria-modal="true" aria-labelledby="cm-title">',
      '  <div id="cm-icon"></div>',
      '  <h3 id="cm-title"></h3>',
      '  <p id="cm-msg"></p>',
      '  <div class="cm-btns">',
      '    <button id="cm-cancel" type="button">Cancel</button>',
      '    <button id="cm-ok" type="button">Confirm</button>',
      '  </div>',
      '</div>',
    ].join('');
    document.body.appendChild(backdrop);

    okBtn = document.getElementById('cm-ok');
    document.getElementById('cm-cancel').addEventListener('click', close);
    okBtn.addEventListener('click', submit);
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && backdrop.classList.contains('cm-open')) close();
    });
  }

  function open(form) {
    pendingForm = form;

    var variant = form.dataset.confirmVariant || (form.hasAttribute('data-confirm-danger') ? 'danger' : 'primary');
    var title   = form.dataset.confirmTitle || 'Are you sure?';
    var msg     = form.dataset.confirm      || 'This action cannot be undone.';
    var label   = form.dataset.confirmOk    || (variant === 'danger' ? 'Yes, delete' : 'Confirm');

    document.getElementById('cm-title').textContent = title;
    document.getElementById('cm-msg').textContent   = msg;
    okBtn.textContent = label;
    okBtn.className   = 'cm-' + variant;

    var icon = document.getElementById('cm-icon');
    icon.className = 'cm-' + (variant === 'danger' ? 'd' : variant === 'warning' ? 'w' : 'p');
    icon.innerHTML = ICONS[variant] || ICONS.primary;

    backdrop.classList.add('cm-open');
    okBtn.focus();
  }

  function close() {
    pendingForm = null;
    backdrop.classList.remove('cm-open');
  }

  function submit() {
    var form = pendingForm;
    close();
    if (form) form.submit();
  }

  document.addEventListener('DOMContentLoaded', function () {
    build();
    document.querySelectorAll('form[data-confirm]').forEach(function (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        open(form);
      });
    });
  });
}());
