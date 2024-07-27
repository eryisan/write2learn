

(function() {

  // 监听从background脚本发送的消息
  chrome.runtime.onMessage.addListener((message) => {
    switch (message.action) {
      case 'executeLearningScript':
        executeLearningScript(); // 执行学习相关代码
        break;
      case 'streamData':
        processStreamData(message.data, message.targetClass); // 处理流数据
        break;
      case 'endStream':
        processRemainingBuffer(message.targetClass); // 处理剩余的缓冲数据
        break;
    }
  });

  let md = new markdownit();;
  let conversation = [];
  let buffers = {
    'wtl-analyze': '',
    'wtl-diagram': '',
    'wtl-chat-summit': '',
    'wtl-word-context': ''
  };
  let inCodeBlock = false;
  let currentComponentIndex = 0;
  let currentSentences = []; 

  // 添加右下角按钮
  const button = document.createElement('div');
  button.id = 'my-wtl-button';
  button.textContent = 'w2l';
  button.addEventListener('click', executeLearningScript);
  document.documentElement.appendChild(button);

  // ---------------------------------------------------------------------> 全局监听事件

  document.addEventListener('click', handleClickEvent);

  function handleClickEvent(e) {
    const target = e.target;
    const popup = document.querySelector('#wtl-popup');

    if (popup && !popup.contains(target)) {
      popup.remove();
      conversation = [];
    } else if (popup && popup.contains(target)) {
      e.stopPropagation();
    }

    if (target.closest('.tools-container') !== null) {
      const toolsContainer = document.querySelector('#wtl-popup .tools-container');
      const buttons = toolsContainer.querySelectorAll('button');
      const buttonIndex = Array.from(buttons).indexOf(target);

      if (buttonIndex !== -1) {
        currentComponentIndex = buttonIndex;
        updateComponentsDisplay();
      }
    }

    const actionMap = {
      'wtl-prev': () => navigateComponent(-1),
      'wtl-next': () => navigateComponent(1),
      'wtl-placeholder': () => {
        e.stopPropagation();
        showPopup(createPopupContent(target.getAttribute('data-word'), target.getAttribute('data-sentence')));
      },
      'wtl-check-word': () => handleWordCheck(target),
      'wtl-chat-summit': () => handleChatSummit(target),
      'wtl-record': () => handleRecord(target.getAttribute('data-word')),
      'wtl-cambridge': () => fetchDictionary('wtl-cambridge', 'getCambridge', target.getAttribute('data-word'), parseCambridgeHTML, generateCambridgeContent),
      'wtl-collins': () => fetchDictionary('wtl-collins', 'getCollins', target.getAttribute('data-word'), parseCollinsHTML, generateCollinsContent),
      'wtl-conjugations': () => fetchDictionary('wtl-conjugations', 'getConjugations', target.getAttribute('data-word'), parseConjugationsHTML, generateConjugationsContent),
      'wtl-word-context': () => handleWordContext(target.getAttribute('data-word')),
      'wtl-analyze': () => handleAnalyze(target.getAttribute('data-sentence')),
      'wtl-diagram': () => handleDiagram(target.getAttribute('data-sentence')),
      'wtl-writing': () => handleWriting(target.getAttribute('data-word')),
      'wtl-show-translation': () => toggleTranslationVisibility(true),
      'wtl-show-others': () => showAllDefinitions(),
      'answer-box': () => showAnswers(),
      'wtl-play-audio': (e) => {
        e.preventDefault();
        playAudio(target.getAttribute('data-audio'));
      },
      'wtl-delete-button': () => deleteWord(target.getAttribute('data-word')),
      'wtl-add-prompt': () => handleAddPrompt(),
      'wtl-save-prompt': () => handleSavePrompt(target),
      'wtl-prompt-list': () => showPromptList(),
      'wtl-delete-prompt': () => deletePrompt(target, target.getAttribute('data-name')),
      'wtl-save-selected-prompt': () => saveSelectedPrompts(),
      'wtl-fill-prompt': () => fillPrompt(target.getAttribute('data-name')),
      'wtl-chat-ai': () => showChatAiButton(),
      'conjugation-btn': () => handleDictionaryButtonClick(target, 'wtl-conjugations', 'getConjugations', parseConjugationsHTML, generateConjugationsContent),
      'collins-btn': () => handleDictionaryButtonClick(target, 'wtl-collins', 'getCollins', parseCollinsHTML, generateCollinsContent),
      'cambridge-btn': () => handleDictionaryButtonClick(target, 'wtl-cambridge', 'getCambridge', parseCambridgeHTML, generateCambridgeContent),
      'wtl-change-sentence': () => handleChangeSentence(),
      'wtl-current-website-sentences': () => handleCurrentWebsiteSentences(),
      'wtl-free-search': () => handleFreeSearch(),
      'analyze-btn': () => handleButtonClick(target, 'wtl-analyze', handleAnalyze),
      'diagram-btn': () => handleButtonClick(target, 'wtl-diagram', handleDiagram),
      'context-btn': () => handleButtonClick(target, 'wtl-word-context', handleWordContext),
      'interactive-cambridge': () => handleCambridgeDataFetch(target.getAttribute('data-word')),
      'interactive-word-context': () => handleWordContextSwitch(target.getAttribute('data-word')),
    };

    for (let className in actionMap) {
      if (target.classList.contains(className) || target.closest(`#wtl-popup .${className}`)) {
        actionMap[className](e);
        break;
      }
    }
  }

  // 监听 .wtl-interactive-container 下的 input 事件
  document.addEventListener('focusin', (e) => {
    if (e.target.closest('.wtl-interactive-container') && e.target.tagName === 'INPUT') {
      handleInteractiveInputFocus(e.target);
    }
  });

  document.addEventListener('focusout', (e) => {
    if (e.target.closest('.wtl-interactive-container') && e.target.tagName === 'INPUT') {
      handleInteractiveInputBlur(e.target);
    }
  });

  // 监听选择文本
  document.body.addEventListener('mouseup', function(e) {
    const selectedText = window.getSelection().toString().trim();
    selectedText.length > 0 ? showFloatingButton(e.clientX, e.clientY, selectedText) : removeFloatingButton();
  });
  
  // 监听输入框Enter键
  document.addEventListener('keypress', (e) => {
    if (e.target.classList.contains('wtl-fill-blank') && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); 
      const input = e.target;
      const summitButton = input.nextElementSibling; 
  
      if (summitButton && (summitButton.classList.contains('wtl-check-word') || summitButton.classList.contains('wtl-chat-summit'))) {
        summitButton.click();
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      handleDictionaryInputEnterKey(e);
    }
  });

  // 监听输入框输入
  document.addEventListener('input', function(event) {
    if (event.target.classList.contains('wtl-fill-blank')) {
      const textarea = event.target;
      textarea.style.height = 'auto'; 
      textarea.style.height = `${textarea.scrollHeight}px`; 
    }
  });

  // ---------------------------------------------------------------------> AI出题语法练习

  function handleInteractiveInputFocus(input) {
    const container = input.closest('.wtl-interactive-container');
    let interactiveDictionary = container.querySelector('.interactive-dictionary');
    let interactiveOptions = container.querySelector('.interactive-options');
    
    if (input.closest('.part-of-speech-tagging')) {
      const word = input.getAttribute('data-word');
      const pos = input.getAttribute('data-pos');
  
      if (!interactiveOptions) {
        interactiveOptions = document.createElement('div');
        interactiveOptions.classList.add('interactive-options');
        interactiveOptions.innerHTML = `
          <button class="interactive-cambridge">📕 Cambridge Dictionary</button>
          <button class="interactive-word-context">💭 Word in Context</button>
        `;
        input.closest('.part-of-speech-tagging').insertAdjacentElement('beforeend', interactiveOptions);
      }

      // Update the data-word attribute for each button
      interactiveOptions.querySelectorAll('button').forEach(button => {
        button.setAttribute('data-word', word);
      });

      if (!interactiveDictionary) {
        interactiveDictionary = document.createElement('div');
        interactiveDictionary.classList.add('interactive-dictionary');
        input.closest('.part-of-speech-tagging').insertAdjacentElement('beforeend', interactiveDictionary);
      }
  
      interactiveDictionary.replaceChildren();
      interactiveDictionary.insertAdjacentHTML('beforeend', '<span class="loader"></span>');
  
      chrome.runtime.sendMessage({ action: 'getCollins', word }, (response) => {
        if (response.error) {
          interactiveDictionary.replaceChildren();
          interactiveDictionary.insertAdjacentHTML('beforeend', `<p class="error">Error fetching Collins data, Please try again...</p>`);
          return;
        }

        const propertyInfo = parseCollinsHTML(response.info);
        if (propertyInfo.length === 0) {
          interactiveDictionary.remove();
          input.value = word;
        } else {
          const content = generateCollinsDefinitions(propertyInfo, pos);
          interactiveDictionary.replaceChildren();
          interactiveDictionary.insertAdjacentHTML('beforeend', content);
        }

      });
    } else {
      if (interactiveDictionary) {
        interactiveDictionary.remove();
      }
      if (interactiveOptions) {
        interactiveOptions.remove();
      }
    }
  }
  

  function handleInteractiveInputBlur(input) {
    const inputValue = input.value.trim();
    const dataWord = input.getAttribute('data-word');

    if (inputValue === dataWord) {
      handleCorrectInput(input);
    } else {
      handleIncorrectInput(input);
    }
  }


  // 处理wtl-writing的点击事件 
  async function handleWriting(word) {
    replaceComponentContent('wtl-writing', '<span class="loader"></span>');
    const response = await chrome.runtime.sendMessage({ action: 'getCollins', word });
    if (response.error) {
      replaceComponentContent('wtl-writing', `<div><h3>Error:</h3><p class="error">${response.error}</p></div>`);
      return;
    }

    const sentences = parseCollinsExamples(response.info);
    if (sentences.length > 0) {
      appendComponentContent('wtl-writing', '<p class="info">Sentences found. Trying to generate content using AI...</p>');
      await generateWritingExercise(sentences);
    } else {
      replaceComponentContent('wtl-writing', '<div><h3>Error:</h3><p class="error">No sentences found. Please try again, or check if the word includes sentences at https://www.collinsdictionary.com/dictionary/english.</p></div>');
    }
  }

  async function generateWritingExercise(sentences) {
    const randomSentence = sentences[Math.floor(Math.random() * sentences.length)];
    await handleWritingSentence(randomSentence, sentences);
  }

  // 提取生成练习的函数
  async function handleWritingSentence(sentence, sentences) {
    const response = await chrome.runtime.sendMessage({ action: 'getWriting', sentence: sentence });
    if (response.error) {
      replaceComponentContent('wtl-writing', `
        <div><h3>Error:</h3><p class="error">${response.error}</p></div>
      `);
      return;
    }
    generateExercise(response.answer, sentence, sentences);
  }

  // 生成练习的函数
  function generateExercise(data, usedSentence, sentences) {
    const htmlContentMatch = data.match(/```html([\s\S]*?)```/);
    if (htmlContentMatch && htmlContentMatch[1]) {
      let htmlContent = htmlContentMatch[1].trim();

      // 使用正则表达式匹配${任意字符}和$[任意字符]
      htmlContent = htmlContent.replace(/\{([^}]+)\}\[([^\]]+)\]/g, '<input data-word="$1" type="text" data-pos="$2"/>');
      // 替换剩余没有$[text]的${任意字符}
      htmlContent = htmlContent.replace(/\{([^}]+)\}/g, '<input data-word="$1" type="text"/>');
      
      const changeSentenceButtons = `
        <div class="wtl-change-container">
          <button class="wtl-change-sentence">New Sentence</button>
          <button class="wtl-current-website-sentences">Current Website Sentences</button>
        </div>`;
      
      replaceComponentContent('wtl-writing', changeSentenceButtons + htmlContent);

      // 保存当前的例句数组，排除已经使用过的例句
      currentSentences = sentences.filter(sentence => sentence !== usedSentence);
    } else {
      replaceComponentContent('wtl-writing', '<div><h3>Error:</h3><p class="error">The AI-generated content format is incorrect, please try again...</p></div>');
    }
  }

  // 处理更换例句的逻辑
  function handleChangeSentence() {
    if (currentSentences.length > 0) {
      replaceComponentContent('wtl-writing', '<span class="loader"></span>');
      const randomSentence = currentSentences[Math.floor(Math.random() * currentSentences.length)];
      handleWritingSentence(randomSentence, currentSentences);
    }
  }

  // 处理当前网站句子的逻辑
  function handleCurrentWebsiteSentences() {
    currentSentences = extractSentencesFromPage().map(item => item.text);
    handleChangeSentence();
  }

  // 生成柯林斯词典定义内容的HTML
  function generateCollinsDefinitions(propertyInfo, pos) {
    let content = `<div class="definition-content">
                     <span class="part-of-speech">${pos}</span>
                   </div>`;
    content += propertyInfo.map(info =>
      info.definitions.map(def =>
        `<div class="definition-content">
          <span class="part-of-speech">${def.partOfSpeech ? def.partOfSpeech : ''}</span>
          <span class="definition-text">${def.senses[0]?.definition.replace(new RegExp(`\\b${info.word}\\b`, 'g'), '______')}</span>
        </div>`
      ).join('')
    ).join('');
    return content;
  }

  // 解析柯林斯词典HTML内容，只提取例句
  function parseCollinsExamples(rawHTML) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHTML, 'text/html');
    const entry = doc.querySelector('.Cob_Adv_Brit');

    if (!entry) {
      return [];
    }

    return Array.from(entry.querySelectorAll('div[data-type-block="definition.title.type.cobuild"]')).flatMap(definitionBlock => 
      Array.from(definitionBlock.querySelectorAll('.content .hom')).flatMap(hom => 
        Array.from(hom.querySelectorAll('.sense')).flatMap(sense => 
          Array.from(sense.querySelectorAll('.type-example .quote')).map(example => example.textContent.trim())
        )
      )
    );
  }

  function handleCambridgeDataFetch(word) {
    switchToComponent('wtl-cambridge');
    fetchDictionary('wtl-cambridge', 'getCambridge', word, parseCambridgeHTML, generateCambridgeContent)
  }

  function handleWordContextSwitch(word) {
    switchToComponent('wtl-word-context');
    handleWordContext(word);
  }

  // ---------------------------------------------------------------------> 通用搜索

  // 添加 handleFreeSearch 方法
  function handleFreeSearch() {
    const { components, buttonIndex } = getComponentElements('wtl-free-search');
    if (buttonIndex !== -1) {
      const component = components[buttonIndex];
      component.innerHTML = `
        <div class="property-container">
          <div class="search-container">
            <input type="text" autocomplete="off" class="context-input" placeholder="💭 AI Word in Context">
            <button class="context-btn">💭</button>
          </div>
          <div class="search-container">
            <input type="text" autocomplete="off" class="cambridge-input" placeholder="📕 Cambridge Dictionary">
            <button class="cambridge-btn">📕</button>
          </div>
          <div class="search-container">
            <input type="text" autocomplete="off" class="collins-input" placeholder="📘 Collins Dictionary">
            <button class="collins-btn">📘</button>
          </div>
          <div class="search-container">
            <input type="text" autocomplete="off" class="conjugation-input" placeholder="📗 Collins Conjugation">
            <button class="conjugation-btn">📗</button>
          </div>
          <div class="search-container">
            <input type="text" autocomplete="off" class="analyze-input" placeholder="🤖 AI Analyze Sentence">
            <button class="analyze-btn">🤖</button>
          </div>
          <div class="search-container">
            <input type="text" autocomplete="off" class="diagram-input" placeholder="📊 AI Diagram Sentence">
            <button class="diagram-btn">📊</button>
          </div>
        </div>
      `;
    }
  }

  // 通用按钮点击处理方法
  function handleButtonClick(target, targetClass, actionFunction) {
    const input = target.previousElementSibling;
    if (input) {
      const inputValue = input.value.trim();
      input.value = '';
      switchToComponent(targetClass);
      actionFunction(inputValue);
    }
  }

  function handleDictionaryButtonClick(target, targetClass, action, parseFunction, generateFunction) {
    const input = target.previousElementSibling;
    if (input) {
      const inputValue = input.value.trim(); 
      input.value = '';
      switchToComponent(targetClass);
      fetchDictionary(targetClass, action, inputValue, parseFunction, generateFunction);
    }
  }

  function handleDictionaryInputEnterKey(e) {
    const input = e.target;
    const validClasses = [
      'conjugation-input',
      'collins-input',
      'cambridge-input',
      'analyze-input',
      'context-input',
      'diagram-input'
    ];
  
    if (validClasses.some(cls => input.classList.contains(cls))) {
      e.preventDefault();
      const button = input.nextElementSibling;
      if (button) {
        button.click();
      }
    }
  }

  // ---------------------------------------------------------------------> 弹出窗口
  
  // 显示弹出窗口
  function showPopup(content) {
    const popup = document.createElement('div');
    popup.id = 'wtl-popup';
    popup.innerHTML = content;
    document.documentElement.appendChild(popup);

    const toolsContainer = popup.querySelector('.tools-container');
    const contentInner = popup.querySelector('.content-inner');
    
    toolsContainer.querySelectorAll('button').forEach(() => {
      const componentContainer = document.createElement('div');
      componentContainer.classList.add('component-container');
      componentContainer.style.display = 'none';
      contentInner.appendChild(componentContainer);
    });
  
    popup.style.display = 'block';
    popup.style.position = 'fixed';
    popup.style.background = 'none';
    popup.style.top = `${(window.innerHeight - 450) / 2}px`;
    popup.style.left = `${(window.innerWidth - 450) / 2}px`;
    popup.style.zIndex = '2147483647';

    loadSelectedPrompts();
    makePopupDraggable(popup);
  }

  // 使弹出窗口可拖动
  function makePopupDraggable(popup) {
    let isDragging = false;
    let startX, startY, popupX, popupY;
  
    popup.addEventListener('mousedown', (e) => {
      // 检查事件目标是否是输入框或代码框
      if (['TEXTAREA', 'CODE', 'PRE', 'INPUT'].includes(e.target.tagName)) {
        e.stopPropagation();
        return;
      }

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      popupX = popup.offsetLeft;
      popupY = popup.offsetTop;
  
      document.addEventListener('mousemove', dragPopup);
      document.addEventListener('mouseup', stopDragPopup);
    });
  
    function dragPopup(e) {
      if (isDragging) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        popup.style.left = `${popupX + dx}px`;
        popup.style.top = `${popupY + dy}px`;
      }
    }
  
    function stopDragPopup() {
      isDragging = false;
      document.removeEventListener('mousemove', dragPopup);
      document.removeEventListener('mouseup', stopDragPopup);
    }
  }

  // 创建填空容器的HTML
  function createPopupContent(word, sentence) {
    return `
    <div id="wtl-container">
      <div class="switch-container">
        <button class="wtl-prev">🡄</button>
        <button class="wtl-next">🡆</button>
      </div>
      <div class="content-container">
        <div class="content-inner"></div>
      </div>
      <div class="show-prompt-container"></div>
      <div class="tools-container">
        <button class="wtl-free-search" data-word="${word}">📚</button>
        <button class="wtl-chat-ai">💬</button>
        <button class="wtl-writing" data-word="${word}">✏️</button>
        <button class="wtl-word-context" data-word="${word}">💭</button>
        <button class="wtl-cambridge" data-word="${word}">📕</button>
        <button class="wtl-collins" data-word="${word}">📘</button>
        <button class="wtl-conjugations" data-word="${word}">📗</button>
        <button class="wtl-analyze" data-sentence="${sentence}">🤖</button>
        <button class="wtl-diagram" data-sentence="${sentence}">📊</button>
        <button class="wtl-record" data-word="${word}">📆</button>
        <button class="wtl-add-prompt">➕</button>
        <button class="wtl-prompt-list">🧾</button>
      </div>
      <div class="fill-container">
        <textarea rows="1" class="wtl-fill-blank" data-word="${word}" data-sentence="${sentence}" placeholder="Enter the word"></textarea>
        <button class="wtl-check-word">🔍</button>
      </div>
    </div>
    `;
  }

  // 显示弹出窗口时加载已选中的Prompts
  function loadSelectedPrompts() {
    chrome.storage.local.get(['selected_prompt'], (result) => {
      const selectedPrompts = result.selected_prompt || [];
      let content = '';
      selectedPrompts.forEach(name => {
        content += `<button class="wtl-fill-prompt" data-name="${name}">${name}</button>`;
      });
      const promptContainer = document.querySelector('#wtl-popup .show-prompt-container');
      if (promptContainer) {
        promptContainer.replaceChildren();
        promptContainer.insertAdjacentHTML('beforeend', content);
      }
    });
  }

  // ---------------------------------------------------------------------> AI聊天

  // 处理聊天AI按钮的点击事件
  function showChatAiButton() {
    const summitButton = document.querySelector('#wtl-popup button.wtl-check-word');
    if (summitButton) {
      summitButton.classList.remove('wtl-check-word');
      summitButton.classList.add('wtl-chat-summit');
      summitButton.textContent = '🚀';
    }

    const textarea = document.querySelector('#wtl-popup .wtl-fill-blank');
    if (textarea) {
        textarea.placeholder = 'Enter your message to chat with AI';
    }
  }

  // 处理聊天AI的函数
  async function handleChat(inputText) {
    replaceComponentContent('wtl-chat-summit', '<span class="loader"></span>');

    conversation.push({ role: 'user', content: inputText });
    if (conversation.length > 12) {
      conversation.shift();
      conversation.shift();
    }

    const response = await chrome.runtime.sendMessage({ action: 'getChatAi', conversation });
    if (response.error) {
      replaceComponentContent('wtl-chat-summit',`
        <div><h3>Error chatting with AI:</h3><p class="error">${response.error}</p></div>
      `);
      conversation = [];
    } else {
      conversation.push({ role: 'assistant', content: response.answer });
    }
  }

  function handleChatSummit(target) {
    const chatInput = target.previousElementSibling;
    if (chatInput && chatInput.classList.contains('wtl-fill-blank')) {
      const word = chatInput.getAttribute('data-word');
      const sentence = chatInput.getAttribute('data-sentence');
      let chatValue = chatInput.value;
      chatValue = chatValue.replace(new RegExp('\\$\\{sentence\\}', 'g'), sentence);
      chatValue = chatValue.replace(new RegExp('\\$\\{word\\}', 'g'), word);
      switchToComponent('wtl-chat-ai');
      handleChat(chatValue);
      chatInput.value = ''; 
      chatInput.style.height = 'auto';
    }
  }

  // ---------------------------------------------------------------------> 当前组件和内容更新

  function getCurrentComponentContainer() {
    return document.querySelector('#wtl-popup .content-inner').querySelectorAll('.component-container')[currentComponentIndex];
  }

  function getComponentElements(targetClass) {
    const popup = document.querySelector('#wtl-popup');
    const components = popup.querySelectorAll('.content-inner .component-container');
    const buttons = popup.querySelectorAll('.tools-container button');
    const buttonIndex = Array.from(buttons).findIndex(button => button.classList.contains(targetClass));
    return { components, buttonIndex };
  }

  function replaceComponentContent(targetClass, content) {
    const { components, buttonIndex } = getComponentElements(targetClass);

    if (buttonIndex !== -1) {
      const component = components[buttonIndex];
      component.replaceChildren();
      component.insertAdjacentHTML('beforeend', content);
    }
  }

  function appendComponentContent(targetClass, content) {
    const { components, buttonIndex } = getComponentElements(targetClass);

    if (buttonIndex !== -1) {
      const component = components[buttonIndex];
      component.insertAdjacentHTML('beforeend', content);
    }
  }

  function switchToComponent(targetClass) {
    const { buttonIndex } = getComponentElements(targetClass);
  
    if (buttonIndex !== -1) {
      currentComponentIndex = buttonIndex;
      updateComponentsDisplay();
    }
  }

  // ---------------------------------------------------------------------> 按钮点击事件

  // 处理wtl-record的点击事件  
  function handleRecord(word) {
    replaceComponentContent('wtl-record', '<span class="loader"></span>');

    chrome.storage.local.get(['user_word'], (result) => {
      const userWords = result.user_word || [];
      const wordObject = userWords.find(item => item.word === word);
      replaceComponentContent('wtl-record', wordObject ? generateRecordContent(wordObject) : '<p>No data found.</p>');
    });
  }

  // 处理wtl-analyze的点击事件 
  async function handleAnalyze(sentence) {
    replaceComponentContent('wtl-analyze', '<span class="loader"></span>');

    const response = await chrome.runtime.sendMessage({ action: 'getAnalyze', sentence });
    if (response.error) {
      replaceComponentContent('wtl-analyze', `
        <div><h3>Error analyzing sentence:</h3><p class="error">${response.error}</p></div>
      `);
    }
  }

  // 处理wtl-diagram的点击事件 
  async function handleDiagram(sentence) {
    replaceComponentContent('wtl-diagram', '<span class="loader"></span>');

    const response = await chrome.runtime.sendMessage({ action: 'getDiagram', sentence });
    if (response.error) {
      replaceComponentContent('wtl-diagram', `
        <div><h3>Error analyzing sentence:</h3><p class="error">${response.error}</p></div>
      `);
    }
  }

  // 处理wtl-word-context的点击事件 
  async function handleWordContext(word) {
    replaceComponentContent('wtl-word-context', '<span class="loader"></span>');

    const response = await chrome.runtime.sendMessage({ action: 'getWordContext', word });
    if (response.error) {
      replaceComponentContent('wtl-word-context', `
        <div><h3>Error:</h3><p class="error">${response.error}</p></div>
      `);
    }
  }

  // ---------------------------------------------------------------------> 单词数据

  // 生成单词记录内容的HTML
  function generateRecordContent(wordObject) {
    return `
      <div class="info-item bg-red-100">
        <span class="info-title">Count</span>
        <span class="info-value">${wordObject.count} / 5</span>
      </div>
      <div class="info-item bg-yellow-100">
        <span class="info-title">Last Studied</span>
        <span class="info-value">${wordObject.lastStudied}</span>
      </div>
      <div class="info-item bg-green-100">
        <span class="info-title">Review Interval</span>
        <span class="info-value">${wordObject.reviewInterval} days</span>
      </div>
      <div class="info-item bg-blue-100">
        <span class="info-title">Review Date</span>
        <span class="info-value">${wordObject.reviewDate}</span>
      </div>
      <button class="wtl-delete-button" data-word="${wordObject.word}">Delete Word</button>
    `;
  }

  // 删除单词
  function deleteWord(word) {
    chrome.storage.local.get(['user_word'], (result) => {
      let userWords = result.user_word || [];
      userWords = userWords.filter(item => item.word !== word);
      chrome.storage.local.set({ user_word: userWords }, () => {
        handleRecord(word);
      });
    });
  }

  // ---------------------------------------------------------------------> 切换组件

  function navigateComponent(direction) {
    const componentContainers = document.querySelectorAll('#wtl-popup .component-container');
    currentComponentIndex = (currentComponentIndex + direction + componentContainers.length) % componentContainers.length;
    updateComponentsDisplay();
  }

  function updateComponentsDisplay() {
    const contentInner = document.querySelector('#wtl-popup .content-inner');
    const componentContainers = contentInner.querySelectorAll('.component-container');
    
    componentContainers.forEach((container, index) => {
      container.style.display = index === currentComponentIndex ? 'block' : 'none';
    });
  }

  // ---------------------------------------------------------------------> 选择文本浮动按钮

  // Function to show the floating button
  function showFloatingButton(x, y, selectedText) {
    removeFloatingButton(); 
  
    let floatButton = document.createElement('button');
    floatButton.id = 'wtl-float-button';
    floatButton.textContent = '🚀';
    floatButton.style.position = 'fixed';
    floatButton.style.left = `${x - 50}px`;
    floatButton.style.top = `${y - 50}px`;
    floatButton.style.zIndex = '2147483647';
    document.documentElement.appendChild(floatButton);
  
    // Add event listener to floating button
    floatButton.addEventListener('click', function(e) {
      e.stopPropagation();

      // 去除selectedText前后的标点符号
      const cleanedText = selectedText.replace(/^[^\w]+|[^\w]+$/g, '');
      const isValidWord = /^\b[a-zA-Z]+\b$/.test(cleanedText);
      const word = isValidWord ? cleanedText : 'Learn';

      showPopup(createPopupContent(word, selectedText));
      const textarea = document.querySelector('.wtl-fill-blank');
      if (textarea) {
        textarea.value = selectedText;
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;
        showChatAiButton();
      }
      removeFloatingButton();
    });
  }
  
  // Function to remove the floating button if no text is selected
  function removeFloatingButton() {
    const floatButton = document.querySelector('#wtl-float-button');
    if (floatButton) {
      floatButton.remove();
    }
  }

  // ---------------------------------------------------------------------> 添加prompt和保存prompt

  // 处理添加Prompt按钮的点击事件
  function handleAddPrompt() {
    replaceComponentContent('wtl-add-prompt', `
      <div class="prompt-container">
        <textarea class="prompt-name" rows="1" placeholder="Enter prompt name"></textarea>
        <textarea class="prompt-text" placeholder="Enter prompt text, \${sentence} as the sentence reference, \${word} as the word reference, or \${sentence-word}"></textarea>
        <button class="wtl-save-prompt">Save Prompt</button>
      </div>
    `);
  }

  // 处理保存Prompt按钮的点击事件
  function handleSavePrompt(target) {
    const promptContainer = target.closest('.prompt-container');
    const promptName = promptContainer.querySelector('.prompt-name').value.trim();
    const promptText = promptContainer.querySelector('.prompt-text').value.trim();
  
    // 检查promptName和promptText的值是否为空
    if (!promptName || !promptText) {
      const originalPromptNameBg = promptNameElement.style.backgroundColor;
      const originalPromptTextBg = promptTextElement.style.backgroundColor;
  
      if (!promptName) {
        promptNameElement.style.backgroundColor = 'lightcoral';
      }
      if (!promptText) {
        promptTextElement.style.backgroundColor = 'lightcoral';
      }
  
      setTimeout(() => {
        promptNameElement.style.backgroundColor = originalPromptNameBg;
        promptTextElement.style.backgroundColor = originalPromptTextBg;
      }, 2000);
  
      return;
    }
  
    chrome.storage.local.get(['prompt_list'], (result) => {
      const promptList = result.prompt_list || [];
      promptList.push({ name: promptName, text: promptText });
      chrome.storage.local.set({ prompt_list: promptList }, () => {
        switchToComponent('wtl-prompt-list');
        showPromptList();
      });
    });
  }

  // ---------------------------------------------------------------------> 显示Prompt列表和操作

  // 显示Prompt列表
  function showPromptList() {
    chrome.storage.local.get(['prompt_list', 'selected_prompt'], (result) => {
      const promptList = result.prompt_list || [];
      const selectedPrompts = result.selected_prompt || [];
      const content = `
        <div class="prompt-list-container">
          ${promptList.map(prompt => `
            <div class="prompt-item">
              <input type="checkbox" class="prompt-checkbox" data-name="${prompt.name}" ${selectedPrompts.includes(prompt.name) ? 'checked' : ''}>
              <span>${prompt.name}</span>
              <button class="wtl-delete-prompt" data-name="${prompt.name}">Delete</button>
            </div>
          `).join('')}
          <button class="wtl-save-selected-prompt">Save Selected Prompts</button>
        </div>
      `;
      replaceComponentContent('wtl-prompt-list', content);
    });
  }

  // 删除Prompt
  function deletePrompt(target, name) {
    chrome.storage.local.get(['prompt_list', 'selected_prompt'], (result) => {
      let promptList = result.prompt_list || [];
      let selectedPrompts = result.selected_prompt || [];
      
      // 从 prompt_list 中删除
      promptList = promptList.filter(prompt => prompt.name !== name);
  
      // 从 selected_prompt 中删除
      selectedPrompts = selectedPrompts.filter(selectedName => selectedName !== name);
  
      chrome.storage.local.set({ prompt_list: promptList, selected_prompt: selectedPrompts }, () => {
        target.closest('.prompt-item').remove();
        loadSelectedPrompts();
      });
    });
  }

  // 保存选择的Prompt
  function saveSelectedPrompts() {
    const currentComponent = getCurrentComponentContainer();
    const selectedPrompts = [];
    currentComponent.querySelectorAll('.prompt-checkbox:checked').forEach(checkbox => {
      selectedPrompts.push(checkbox.getAttribute('data-name'));
    });
    chrome.storage.local.set({ selected_prompt: selectedPrompts }, () => {
      loadSelectedPrompts();
    });
  }

  // Prompt写入输入框
  function fillPrompt(name) {
    chrome.storage.local.get(['prompt_list'], (result) => {
        const promptList = result.prompt_list || [];
        const prompt = promptList.find(p => p.name === name);
        if (prompt) {
            const textarea = document.querySelector('#wtl-popup .wtl-fill-blank');
            if (textarea) {
              const word = textarea.getAttribute('data-word');
              const sentence = textarea.getAttribute('data-sentence');
              const cleanedText = sentence.replace(new RegExp(word), '?????');
              textarea.value = prompt.text.replace(/\$\{sentence-word\}/g, cleanedText);
              showChatAiButton();
              textarea.style.height = 'auto';
              textarea.style.height = `${textarea.scrollHeight}px`;
            }
        }
    });
  }

  // ---------------------------------------------------------------------> 解析词典HTML和生成所需HTML

  async function fetchDictionary(targetClass, action, word, parseFunction, generateFunction) {
    replaceComponentContent(targetClass, '<span class="loader"></span>');

    try {
      const response = await chrome.runtime.sendMessage({ action, word });
      if (response.error) {
        replaceComponentContent(targetClass, `
          <div><h3>Error fetching property</h3><p class="error">${response.error}</p></div>
        `);
      } else {
        const propertyInfo = parseFunction(response.info);
        if (!propertyInfo.length) {
          handleEmptyPropertyInfo(targetClass);
        } else {
          const content = generateFunction(propertyInfo);
          replaceComponentContent(targetClass, content);
        }
      }
    } catch (error) {
      replaceComponentContent(targetClass, `
        <div>
          <h3>Error fetching property for <strong>${word}</strong>:</h3>
          <p class="error">${error.message}</p>
        </div>
      `);
    }
  }

  function handleEmptyPropertyInfo(targetClass) {
    switch (targetClass) {
      case 'wtl-collins':
        throw new Error('The requested word does not exist. Please try searching on the Collins Dictionary website: <a href="https://www.collinsdictionary.com/dictionary/english/" target="_blank" >Collins Dictionary</a>');
      case 'wtl-cambridge':
        throw new Error('The requested word does not exist. Please try searching on the Cambridge Dictionary website: <a href="https://dictionary.cambridge.org/dictionary/english-chinese-simplified/" target="_blank" >Cambridge Dictionary</a>');
      case 'wtl-conjugations':
        throw new Error('Sorry, No results were found in the English conjugations. Please try searching on the Collins Dictionary website: <a href="https://www.collinsdictionary.com/conjugations/english/" target="_blank" >Collins Dictionary</a>');
      default:
        throw new Error('No results found.');
    }
  }

  // 解析柯林斯Conjugations HTML内容，提取必要信息
  function parseConjugationsHTML(rawHTML) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHTML, 'text/html');
    const entry = doc.querySelector('.res_cell_center_content');

    if (!entry) {
      return [];
    }

    const sections = Array.from(entry.querySelectorAll('.type, .conjugation')).map(sectionNode => ({
      h2: sectionNode.querySelector('h2')?.textContent.trim(),
      infl: Array.from(sectionNode.querySelectorAll('.infl')).map(inflNode => inflNode.textContent.trim())
    }));

    if (sections.length === 0) {
      return [];
    }
  
    return sections;
  }

  // 生成柯林斯词典Conjugations的HTML
  function generateConjugationsContent(propertyInfo) {
    const headerColors = ['bg-red-100', 'bg-yellow-100', 'bg-green-100', 'bg-blue-100'];
    return `
      <div class="property-container">
      ${propertyInfo.map((section, index) => `
        <div class="property-box">
          <div class="header ${headerColors[index % headerColors.length]}">${section.h2}</div>
          <div class="body">
            <div class="example-box">
              <ul>
                ${section.infl.map(infl => `
                  <li class="infl-text">${infl}</li>
                `).join('')}
              </ul>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
    `;
  }

  // 解析柯林斯词典HTML内容，提取必要信息
  function parseCollinsHTML(rawHTML) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHTML, 'text/html');
    const entry = doc.querySelector('.Cob_Adv_Brit');

    if (!entry) {
      return [];
    }

    return Array.from(entry.querySelectorAll('div[data-type-block="definition.title.type.cobuild"]')).map(definitionBlock => ({
      word: definitionBlock.querySelector('.cB-h .orth')?.textContent.trim(),
      type: definitionBlock.querySelector('.cB-h .type-misc')?.textContent.trim(),
      pronunciation: {
        audio: Array.from(definitionBlock.querySelectorAll('.mini_h2 .audio_play_button')).map(audio => audio.getAttribute('data-src-mp3')),
        text: definitionBlock.querySelector('.mini_h2')?.textContent.trim(),
      },
      form: definitionBlock.querySelector('.content > .type-infl')?.textContent.trim(),
      definitions: Array.from(definitionBlock.querySelectorAll('.content .hom')).map(hom => ({
        partOfSpeech: hom.querySelector('.pos')?.textContent.trim(),
        senses: Array.from(hom.querySelectorAll('.sense')).slice(0, 1).map(sense => {
          const definitionElement = sense.querySelector('.def');
          const definitionText = definitionElement ? definitionElement.textContent.trim() : (sense.classList.contains('def') ? sense.textContent.trim() : '');
          return {
            definition: definitionText,
            examples: Array.from(sense.querySelectorAll('.type-example .quote')).map(example => example.textContent.trim())
          };
        })
      })).filter(definition => definition.partOfSpeech || definition.senses.some(sense => sense.definition)) 
    }));
  }

  // 生成柯林斯词典内容的HTML
  function generateCollinsContent(propertyInfo) {
    const headerColors = ['bg-red-100', 'bg-yellow-100', 'bg-green-100', 'bg-blue-100'];
    return `
      <div class="property-container">
        ${propertyInfo.map((info, index) => `
          <div class="property-box">
            <div class="header ${headerColors[index % headerColors.length]}">
              <div class="type">${info.type ? info.type : ''}</div>
              <div class="answer-box">
                <div class="answer" style="display: none;">
                  <span class="word-text">${info.word}</span>
                  <span class="pronunciation-text">${info.pronunciation.text}</span>
                </div>
                <div class="answer-placeholder">[Answer]</div>
              </div>
              <div class="pronunciation">
                ${info.pronunciation.audio.map(audio => `<a href="#" class="wtl-play-audio" data-audio="${audio}">🔊</a>`).join('')}
              </div>
            </div>
            <div class="body">
              ${info.form ? `<div class="definition-content form-content" style="display: none;">${info.form}</div>` : ''}
              ${info.definitions.map((def, defIndex) => `
                <div class="definition-box" style="${defIndex === 0 ? '' : 'display: none;'}">
                  <div class="definition-content">
                    <span class="part-of-speech">${def.partOfSpeech ? def.partOfSpeech : ''}</span>
                    <span class="definition-text">${def.senses[0]?.definition.replace(new RegExp(`\\b${info.word}\\b`, 'g'), '______')}</span>
                  </div>
                  <div class="example-box">
                    <ul>
                      ${def.senses[0]?.examples.slice(0, 2).map(example => `
                        <li class="example-sentence">${example.replace(new RegExp(`\\b${info.word}\\b`, 'g'), '______')}</li>
                      `).join('')}
                    </ul>
                  </div>
                </div>
              `).join('')}
              ${info.definitions.length > 1 ? '<button class="wtl-show-others">Show Others</button>' : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }


  // 解析剑桥词典HTML内容，提取必要信息
  function parseCambridgeHTML(rawHTML) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHTML, 'text/html');
    const entries = doc.querySelectorAll('.entry-body__el');

    if (entries.length === 0) {
      return [];
    }

    return Array.from(entries).map(entry => ({
      word: entry.querySelector('.headword')?.textContent.trim(),
      partOfSpeech: entry.querySelector('.posgram')?.textContent.trim(),
      usPronunciationAudio: entry.querySelector('.us .daud source[type="audio/mpeg"]')?.getAttribute('src'),
      usPronunciationText: entry.querySelector('.us .pron')?.textContent.trim(),
      definitions: Array.from(entry.querySelectorAll('.pos-body .def-block')).map(defBlock => ({
        definition: defBlock.querySelector('.ddef_h .def')?.textContent.trim(),
        translation: defBlock.querySelector('.def-body .trans')?.textContent.trim(),
        examples: Array.from(defBlock.querySelectorAll('.def-body .examp')).map(exampleElement => ({
          exampleSentence: exampleElement.querySelector('.eg')?.textContent.trim(),
          exampleTranslation: exampleElement.querySelector('.trans')?.textContent.trim()
        }))
      }))
    }));
  }
  
  // 生成剑桥词典内容的HTML
  function generateCambridgeContent(propertyInfo) {
    const headerColors = ['bg-red-100', 'bg-yellow-100', 'bg-green-100', 'bg-blue-100'];
    return `
      <div class="property-container">
        <button class="wtl-show-translation">Show Translation</button>
        ${propertyInfo.map((info, index) => `
          <div class="property-box">
            <div class="header ${headerColors[index % headerColors.length]}">
              <div class="part-of-speech">${info.partOfSpeech ? info.partOfSpeech : ''}</div>
              <div class="answer-box">
                <div class="answer" style="display: none;">
                  <span class="word-text">${info.word}</span> <span class="pronunciation-text">(${info.usPronunciationText})</span>
                </div>
                <div class="answer-placeholder">[Answer]</div>
              </div>
              ${info.usPronunciationAudio ? `<a href="#" class="wtl-play-audio" data-audio="https://dictionary.cambridge.org${info.usPronunciationAudio}">🔊</a>` : ''}
            </div>
            <div class="body">
              ${info.definitions.map((def, defIndex) => `
                <div class="definition-box" style="${defIndex === 0 ? '' : 'display: none;'}">
                  <div class="definition-content">
                    <p class="definition-text">${def.definition}</p>
                    <p class="definition-translation" style="display: none;">${def.translation}</p>
                  </div>
                  <div class="example-box">
                    <ul>
                      ${def.examples.map(ex => `
                        <li class="example-sentence">${ex.exampleSentence.replace(new RegExp(`\\b${info.word}\\b`, 'g'), '______')}</li>
                        <li class="example-translation" style="display: none;">${ex.exampleTranslation}</li>
                      `).join('')}
                    </ul>
                  </div>
                </div>
              `).join('')}
              ${info.definitions.length > 1 ? '<button class="wtl-show-others">Show Others</button>' : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // ---------------------------------------------------------------------> 词典操作

  // 切换翻译的可见性
  function toggleTranslationVisibility(visible) {
    const currentComponent = getCurrentComponentContainer();
    currentComponent.querySelectorAll('.definition-translation, .example-translation').forEach(el => {
      el.style.display = visible ? 'block' : 'none';
    });
  }
  
  // 显示所有定义
  function showAllDefinitions() {
    const currentComponent = getCurrentComponentContainer();
    currentComponent.querySelectorAll('.definition-box').forEach(box => {
      box.style.display = 'block';
    });
    currentComponent.querySelectorAll('.wtl-show-others').forEach(button => {
      button.style.display = 'none';
    })
  }
  
  // 显示答案
  function showAnswers() {
    const currentComponent = getCurrentComponentContainer();
    currentComponent.querySelectorAll('.answer').forEach(el => {
      el.style.display = 'block';
    });
    currentComponent.querySelectorAll('.answer-placeholder').forEach(el => {
      el.style.display = 'none';
    });
    currentComponent.querySelectorAll('.example-sentence').forEach(el => {
      const answerText = el.closest('.property-box').querySelector('.word-text').textContent.trim();
      el.textContent = el.textContent.replace(/______/g, answerText);
    });
    currentComponent.querySelectorAll('.definition-text').forEach(el => {
      const answerText = el.closest('.property-box').querySelector('.word-text').textContent.trim();
      el.textContent = el.textContent.replace(/______/g, answerText);
    });
    currentComponent.querySelectorAll('.form-content').forEach(el => {
      el.style.display = 'block';
    });
  }
  
  // 播放音频
  function playAudio(audioSource) {
    chrome.runtime.sendMessage({ action: 'playAudio', source: audioSource });
  }

  // ---------------------------------------------------------------------> 检查单词和记录单词

  function handleWordCheck(target) {
    const input = target.previousElementSibling;
    if (input && input.classList.contains('wtl-fill-blank')) {
      if (input.value === input.getAttribute('data-word')) {
        handleCorrectInput(input);
        const word = input.getAttribute('data-word');
        const sentence = input.getAttribute('data-sentence');
        const placeholder = document.querySelector(`span.wtl-placeholder[data-word="${word}"][data-sentence="${sentence}"]`);
        if (placeholder) {
          placeholder.textContent = word;
        }
      } else {
        handleIncorrectInput(input);
      }
    }
  }

  // 处理正确的输入
  function handleCorrectInput(input) {
    const today = new Date().toLocaleDateString();
    chrome.storage.local.get(['user_word', 'today_info'], (result) => {
      let userWords = result.user_word || [];
      let todayInfo = result.today_info || { count: 0, date: today };
  
      if (today !== todayInfo.date) {
        todayInfo.count = 0;
        todayInfo.date = today;
      }
  
      const wordIndex = userWords.findIndex(item => item.word === input.value);
  
      if (wordIndex === -1) {
        userWords.push({ word: input.value, count: 1, lastStudied: today, reviewInterval: 5, reviewDate: today });
        todayInfo.count += 1;
      } else {
        const wordObject = userWords[wordIndex];
        if (wordObject.count < 5) {
          wordObject.count += 1;
          wordObject.lastStudied = today;
          wordObject.reviewDate = today;
          if (wordObject.count === 5) {
            wordObject.reviewDate = addDays(today, wordObject.reviewInterval);
          }
          userWords[wordIndex] = wordObject;
        }
      }
  
      chrome.storage.local.set({ user_word: userWords, today_info: todayInfo });
    });
    const originalBackgroundColor = input.style.backgroundColor; 
    input.style.backgroundColor = 'lightgreen';

    setTimeout(() => {
      input.style.backgroundColor = originalBackgroundColor; 
    }, 2000); 
  }
  
  // 处理错误的输入
  function handleIncorrectInput(input) {
    const originalBackgroundColor = input.style.backgroundColor; 
    input.value = '';
    input.style.backgroundColor = 'lightcoral';
    input.placeholder = 'Incorrect word'

    setTimeout(() => {
      input.style.backgroundColor = originalBackgroundColor; 
      input.placeholder = 'Enter the word'
    }, 2000); 
  }
  
  // 添加指定天数到日期
  function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result.toLocaleDateString();
  }

  // ---------------------------------------------------------------------> AI数据流
  
  // 处理流数据，更新弹出窗口内容
  function processStreamData(data, targetClass) {
    removeLoader(targetClass);

    buffers[targetClass] += data;
    if (inCodeBlock) {
      const endCodeBlock = buffers[targetClass].indexOf('```', 3);
      if (endCodeBlock !== -1) {
        inCodeBlock = false;
        const codeBlock = buffers[targetClass].slice(0, endCodeBlock + 3);
        appendComponentContent(targetClass, parseMarkdown(codeBlock));
        buffers[targetClass] = buffers[targetClass].slice(endCodeBlock + 3);
      } else {
        return;
      }
    }

    if (buffers[targetClass].startsWith('```') && !inCodeBlock) {
      const endCodeBlock = buffers[targetClass].indexOf('```', 3);
      if (endCodeBlock === -1) {
        inCodeBlock = true;
        return;
      }
    }

    // 使用前瞻正则表达式检查代码块前是否有连续的两个换行符
    if (buffers[targetClass].includes('```') && !buffers[targetClass].startsWith('```')) {
      buffers[targetClass] = buffers[targetClass].replace(/([^\n])(\n```)/, '$1\n$2');
    }

    const parts = buffers[targetClass].split(/\n\n/);

    parts.slice(0, -1).forEach(part => {
      if (part.trim().length > 0) {
        appendComponentContent(targetClass, parseMarkdown(part));
      }
    });

    buffers[targetClass] = parts[parts.length - 1];
  }

  function processRemainingBuffer(targetClass) {
    if (buffers[targetClass].trim().length > 0) {
      appendComponentContent(targetClass, parseMarkdown(buffers[targetClass]));
    }

    buffers[targetClass] = '';
  }

  // 解析Markdown内容
  function parseMarkdown(content) {
    return md.render(content);
  }

  function removeLoader(targetClass) {
    const { components, buttonIndex } = getComponentElements(targetClass);

    if (buttonIndex !== -1) {
      const component = components[buttonIndex];
      const loader = component.querySelector('.loader');
      if (loader) {
        loader.remove();
      }
    }
  }

  // ---------------------------------------------------------------------> 修改DOM, 生成填空

  // 定义执行学习代码的函数
  function executeLearningScript() {
    const textNodes = getTextNodes(document.body);
    const concatenatedTextArray = concatenateTextNodes(textNodes);
    cleanAndOrganizeData(concatenatedTextArray, modifyDOM);
  }

  // 获取并处理文本节点的主函数
  function extractSentencesFromPage() {
    // 获取文本节点，排除特定标签和空文本节点
    const textNodes = getTextNodes(document.body);
    
    // 拼接文本节点
    const concatenatedTextArray = concatenateTextNodes(textNodes);
    
    // 处理拼接后的文本数组并返回处理后的数据
    return processConcatenatedTextArray(concatenatedTextArray);
  }

  // 获取文本节点，排除特定标签和空文本节点
  function getTextNodes(node) {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
      acceptNode: node => {
        const parent = node.parentNode;
        const isExcludedTag = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'PRE', 'CODE'].includes(parent.nodeName);
        const isEmptyText = !node.nodeValue.trim();
        const isValidCodeTag = parent.nodeName === 'CODE' && parent.childNodes.length === 1 && parent.firstChild.nodeType === Node.TEXT_NODE;
        return (isExcludedTag && !isValidCodeTag) || isEmptyText ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    const textNodes = [];
    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }
    return textNodes;
  }

  // 判断是否应该拼接文本
  function shouldConcatenate(currentNode, nextNode) {
    const getDisplay = node => window.getComputedStyle(node).display;
  
    const currentDisplay = getDisplay(currentNode.parentNode);
    const nextDisplay = getDisplay(nextNode.parentNode);
  
    if (currentDisplay !== 'inline' && nextDisplay !== 'inline') return false;
  
    const findNonInlineParent = node => {
      while (node && getDisplay(node) === 'inline') {
        node = node.parentNode;
      }
      return node;
    };
  
    if (currentDisplay !== 'inline' && nextDisplay === 'inline') {
      return findNonInlineParent(nextNode.parentNode) === currentNode.parentNode;
    }
  
    if (currentDisplay === 'inline' && nextDisplay !== 'inline') {
      return nextNode.parentNode === findNonInlineParent(currentNode.parentNode);
    }
  
    if (currentDisplay === 'inline' && nextDisplay === 'inline') {
      return findNonInlineParent(currentNode.parentNode) === findNonInlineParent(nextNode.parentNode);
    }
  
    return false;
  }

  // 拼接文本
  function concatenateTextNodes(textNodes) {
    const concatenatedTextArray = [];
    const inlineParentToExclude = new Set();
    let concatenatedText = '';
    let i = 0;
  
    while (i < textNodes.length) {
      let currentNode = textNodes[i];
      let currentParent = currentNode.parentNode;
      let foundInlinePlaceholder = false;
  
      // 向上查找，直到找到一个 display 不是 inline 且不是 code 或 pre 的父节点
      while (currentParent && window.getComputedStyle(currentParent).display === 'inline' && !['CODE', 'PRE'].includes(currentParent.nodeName)) {
        if (currentParent.nodeName === 'SPAN' && currentParent.classList.contains('wtl-placeholder')) {
          foundInlinePlaceholder = true;
        }
        currentParent = currentParent.parentNode;
      }
  
      // 如果是 code 或 pre 标签，且 code 标签不只包含一个文本节点，则不处理这个 currentNode
      if (['CODE', 'PRE'].includes(currentParent.nodeName) && !(currentParent.nodeName === 'CODE' && currentParent.childNodes.length === 1 && currentParent.firstChild.nodeType === Node.TEXT_NODE)) {
        i++;
        continue;
      }
  
      // 如果找到过 inline placeholder，记录 currentNonInlineParent
      if (foundInlinePlaceholder) {
        inlineParentToExclude.add(currentParent);
      }
  
      concatenatedText += currentNode.nodeValue;
  
      while (true) {
        const nextNodeIndex = i + 1;
        if (nextNodeIndex >= textNodes.length) break;
        const nextNode = textNodes[nextNodeIndex];
  
        if (shouldConcatenate(currentNode, nextNode)) {
          let nextNodeParent = nextNode.parentNode;
          let foundNextNodePlaceholder = false;
  
          while (nextNodeParent && window.getComputedStyle(nextNodeParent).display === 'inline' && !['CODE', 'PRE'].includes(nextNodeParent.nodeName)) {
            if (nextNodeParent.nodeName === 'SPAN' && nextNodeParent.classList.contains('wtl-placeholder')) {
              foundNextNodePlaceholder = true;
            }
            nextNodeParent = nextNodeParent.parentNode;
          }
  
          if (foundNextNodePlaceholder) {
            inlineParentToExclude.add(nextNodeParent);
          }
  
          concatenatedText += nextNode.nodeValue;
          currentNode = nextNode;
          i = nextNodeIndex; // 更新索引以跳过已处理的节点
        } else {
          break;
        }
      }
  
      concatenatedTextArray.push({
        parentNode: currentParent,
        text: concatenatedText.trim()
      });
      concatenatedText = '';
      i++; // 增加索引以继续处理下一个节点
    }
  
    // 排除掉 parentNode 是需要排除的父节点的数据
    return concatenatedTextArray.filter(item => !inlineParentToExclude.has(item.parentNode));
  }

  // 处理拼接后的文本数组并返回处理后的数据
  function processConcatenatedTextArray(concatenatedTextArray) {
    // 定义过滤逻辑
    const filterText = text => {
      // 如果 text 匹配正则 /[^a-zA-Z0-9\s\p{S}\p{P}]/gu 为 true，则返回 false
      if (/[^a-zA-Z\s\p{P}]/gu.test(text)) {
        return false;
      }

      // 筛选出包含至少 4 个符合条件的单词的文本
      const words = text.match(/(?<=\s)[a-zA-Z]{2,}(?=\s)/g) || [];
      return words.length >= 4;
    };

    // 将每个文本按换行符分割成多个句子
    const splitByNewlines = text => text.split(/\r?\n+/);

    // 将每个文本按单个句号分割成多个句子，匹配两个句号以上不分割
    const splitBySinglePeriod = text => text.split(/(?<!\.)\.(?!\.)/);

    // 处理文本数组
    const processTextArray = dataArray => {
      const filteredDataArray = dataArray.filter(item => filterText(item.text));
      const splitDataArray = filteredDataArray.flatMap(item => splitByNewlines(item.text).map(text => ({ parentNode: item.parentNode, text })));
      const splitByPeriodArray = splitDataArray.flatMap(item => splitBySinglePeriod(item.text).map(text => ({ parentNode: item.parentNode, text })));
      return splitByPeriodArray.filter(item => filterText(item.text));
    };

    return processTextArray(concatenatedTextArray);
  }

  // 清洗和整理数据的函数
  function cleanAndOrganizeData(dataArray, callback) {
    chrome.storage.local.get(['user_word'], result => {
      const userWords = result.user_word || [];
  
      // 定义过滤逻辑
      const filterText = text => {
        // 如果 text 匹配正则 /[^a-zA-Z0-9\s\p{S}\p{P}]/gu 为 true，则返回 false
        if (/[^a-zA-Z0-9\s\p{S}\p{P}]/gu.test(text)) {
          return false;
        }
  
        // 筛选出包含至少 4 个符合条件的单词的文本
        const words = text.match(/(?<=\s)[a-zA-Z]{2,}(?=\s)/g) || [];
        return words.length >= 4;
      };
  
      // 将每个文本按换行符分割成多个句子
      const splitByNewlines = text => text.split(/\r?\n+/);
  
      // 将每个文本按单个句号分割成多个句子，匹配两个句号以上不分割
      const splitBySinglePeriod = text => text.split(/(?<!\.)\.(?!\.)/);
  
      // 处理文本数组
      const processTextArray = dataArray => {
        const filteredDataArray = dataArray.filter(item => filterText(item.text));
        const splitDataArray = filteredDataArray.flatMap(item => splitByNewlines(item.text).map(text => ({ parentNode: item.parentNode, text })));
        const splitByPeriodArray = splitDataArray.flatMap(item => splitBySinglePeriod(item.text).map(text => ({ parentNode: item.parentNode, text })));
        return splitByPeriodArray.filter(item => filterText(item.text));
      };
  
      // 组织数据
      const organizedDataArray = processTextArray(dataArray).map(item => {
        const words = item.text.match(/(?<=\s)[a-zA-Z'-]+|[a-zA-Z'-]+(?=\s|,)/g) || [];
        const newWords = words.filter(word => !userWords.some(userWord => userWord.word === word && userWord.count >= 5));
        return { parentNode: item.parentNode, sentence: item.text, words, word: newWords[0] || null };
      }).filter(item => item.word);
  
      // 调用回调函数返回数据
      callback(organizedDataArray);
    });
  }

  // 修改DOM内容
  function modifyDOM(newDataArray) {
    newDataArray.forEach(item => {
      const parentNode = item.parentNode;

      if (parentNode) {
        // 使用正则表达式查找item.word在item.sentence中的位置
        const regex = new RegExp(`(?<=\\s)${item.word}|${item.word}(?=\\s|,)`);
        const match = item.sentence.match(regex);

        if (match && match.index !== undefined) {
          const wordIndex = match.index;
  
          // 找到item.word后面的10个字符
          let afterWord = item.sentence.substring(wordIndex + item.word.length, wordIndex + item.word.length + 10);

          // 对afterWord进行转义
          afterWord = escapeRegExp(afterWord);

          // 创建新的正则表达式，使用前瞻断言
          const lookaheadRegex = new RegExp(`${item.word}(?=${afterWord})`);
          
          // 使用新的正则表达式替换parentNode.innerHTML中的内容
          const newHTML = parentNode.innerHTML.replace(lookaheadRegex, `<span class="wtl-placeholder" data-word="${item.word}" data-sentence="${item.sentence}">?????</span>`);
          parentNode.replaceChildren();
          parentNode.insertAdjacentHTML('beforeend', newHTML);
        }
      }
    });
  }

  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

})();

