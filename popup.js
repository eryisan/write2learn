console.log('popup.js is loaded.');

const modelSelect = document.getElementById('modelSelect');
const modelNameInput = document.getElementById('modelName');
const apiKeyInput = document.getElementById('apiKey');
const saveSettingsButton = document.getElementById('saveSettings');
const clearKeysButton = document.getElementById('clearKeys');
const exportDataButton = document.getElementById('exportData');
const importDataFile = document.getElementById('importDataFile');
const clearAllDataButton = document.getElementById('clearAllData');

const totalWordsCount = document.getElementById('totalWordsCount');
const totalWordsProgressBar = document.getElementById('totalWordsProgressBar');
const todayWordsCount = document.getElementById('todayWordsCount');
const todayWordsProgressBar = document.getElementById('todayWordsProgressBar');
const reviewWordsCount = document.getElementById('reviewWordsCount');

const navLinks = document.querySelectorAll('.navlink');
const tabContents = document.querySelectorAll('.tabcontent');

const setElementValue = (element, value) => {
  element.value = value || '';
};

const setProgressBar = (progressBar, percentage) => {
  progressBar.style.width = `${Math.min(percentage, 100)}%`;
};

const updateTotalWordsProgress = (userWords) => {
  const totalWords = userWords.length;
  totalWordsCount.textContent = totalWords;
  setProgressBar(totalWordsProgressBar, (totalWords / 20000) * 100);
};

const updateTodayWordsProgress = (todayInfo) => {
  todayWordsCount.textContent = todayInfo.count;
  setProgressBar(todayWordsProgressBar, (todayInfo.count / 50) * 100);
};

const updateReviewWordsCount = (userWords) => {
  const reviewWords = userWords.filter(word => word.count < 5).length;
  reviewWordsCount.textContent = reviewWords;
};

const loadSettings = (selectedModel) => {
  chrome.storage.local.get([`${selectedModel}_apiKey`, `${selectedModel}_modelName`], (result) => {
    setElementValue(apiKeyInput, result[`${selectedModel}_apiKey`]);
    setElementValue(modelNameInput, result[`${selectedModel}_modelName`]);
  });
};

// Event Listeners
modelSelect.addEventListener('change', () => {
  const selectedModel = modelSelect.value;
  chrome.storage.local.set({ selectedModel }, () => loadSettings(selectedModel));
});

saveSettingsButton.addEventListener('click', () => {
  const selectedModel = modelSelect.value;
  chrome.storage.local.set({
    selectedModel, 
    [`${selectedModel}_apiKey`]: apiKeyInput.value, 
    [`${selectedModel}_modelName`]: modelNameInput.value
  });
});

clearKeysButton.addEventListener('click', () => {
  chrome.storage.local.get(null, (items) => {
    const keysToRemove = Object.keys(items).filter(key => key.endsWith('apiKey'));
    chrome.storage.local.remove(keysToRemove, () => {
      apiKeyInput.value = '';
    });
  });
});

exportDataButton.addEventListener('click', () => {
  chrome.storage.local.get(null, (items) => {
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(items));
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', 'data.json');
    linkElement.click();
  });
});

importDataFile.addEventListener('change', (event) => {
  const fileReader = new FileReader();
  fileReader.onload = (event) => {
    const importedData = JSON.parse(event.target.result);

    // 清空本地存储中的所有数据
    chrome.storage.local.clear(() => {
      // 导入新数据
      chrome.storage.local.set(importedData, () => {

        // 获取当前的 modelSelect 值
        const selectedModel = modelSelect.value;
        
        // 从导入的数据中获取相应的 modelName 和 apiKey
        const importedModelName = importedData[`${selectedModel}_modelName`] || '';
        const importedApiKey = importedData[`${selectedModel}_apiKey`] || '';

        // 将获取到的值填入输入框中
        modelNameInput.value = importedModelName;
        apiKeyInput.value = importedApiKey;
      });
    });
  };
  fileReader.readAsText(event.target.files[0]);
});

clearAllDataButton.addEventListener('click', () => {
  chrome.storage.local.clear(() => {
    modelSelect.value = 'chatgpt'; 
    modelNameInput.value = ''; 
    apiKeyInput.value = ''; 

    totalWordsCount.textContent = '0';
    totalWordsProgressBar.style.width = '0%';
    todayWordsCount.textContent = '0';
    todayWordsProgressBar.style.width = '0%';
    reviewWordsCount.textContent = '0';
  });
});

navLinks.forEach(navLink => {
  navLink.addEventListener('click', () => {
    navLinks.forEach(link => link.classList.remove('active'));
    navLink.classList.add('active');
    const tabId = navLink.getAttribute('data-tab');
    tabContents.forEach(tabContent => {
      tabContent.style.display = (tabContent.id === tabId) ? 'block' : 'none';
    });
  });
});

// Initial Load
chrome.storage.local.get(['selectedModel'], (result) => {
  if (result.selectedModel) {
    modelSelect.value = result.selectedModel;
  }
  loadSettings(modelSelect.value);
});

chrome.storage.local.get(['user_word', 'today_info'], (result) => {
  const userWords = result.user_word || [];
  const todayInfo = result.today_info || { count: 0, date: new Date().toLocaleDateString() };
  updateTotalWordsProgress(userWords);
  updateTodayWordsProgress(todayInfo);
  updateReviewWordsCount(userWords);
});
