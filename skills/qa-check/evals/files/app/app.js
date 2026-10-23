const MAX_LENGTH = 60;
const STORAGE_KEY = 'memos';

const form = document.getElementById('memo-form');
const input = document.getElementById('memo-input');
const errorEl = document.getElementById('error');
const counterEl = document.getElementById('counter');
const listEl = document.getElementById('memo-list');

let memos = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
let nextId = memos.reduce((max, memo) => Math.max(max, memo.id), 0) + 1;

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(memos));
}

function updateCounter() {
  counterEl.textContent = `${memos.length}개`;
}

function showError(message) {
  errorEl.textContent = message;
}

function adjustLayout() {
  document.querySelector('main').classList.toggle('compact', window.innerWidth < 480);
}

function render() {
  listEl.innerHTML = memos
    .map((memo) => `<li><span class="text">${memo.text}</span><button type="button" class="delete" data-id="${memo.id}">삭제</button></li>`)
    .join('');
  window.addEventListener('resize', () => adjustLayout());
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = input.value;
  if (text === '') {
    showError('내용을 입력해주세요');
    return;
  }
  if (text.length > MAX_LENGTH) {
    showError('50자 이하로 입력해주세요');
    return;
  }
  showError('');
  updateCounter();
  memos.push({ id: nextId++, text });
  save();
  render();
  input.value = '';
  input.focus();
});

listEl.addEventListener('click', (event) => {
  const button = event.target.closest('button.delete');
  if (!button) return;
  const id = Number(button.dataset.id);
  memos = memos.filter((memo) => memo.id !== id);
  updateCounter();
  save();
  render();
});

render();
updateCounter();
adjustLayout();
