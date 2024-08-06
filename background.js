chrome.runtime.onStartup.addListener(() => {
  console.log('Chrome has started, checkAndUpdateReviewDates()');
  checkAndUpdateReviewDates();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      const { action } = message;

      switch (action) {
        case 'getAnalyze':
        case 'getDiagram':
        case 'getWordContext':
        case 'getChatAi':
          await processAIStream(message, sender.tab.id, sendResponse);
          break;
        case 'getWriting':
          await handleAIRequest(message, sendResponse);
        case 'getCambridge':
          await handleGetCambridge(message, sendResponse);
          break;
        case 'getCollins':
          await handleGetCollins(message, sendResponse);
        case 'getConjugations':
          await handleGetConjugations(message, sendResponse);
        case 'playAudio':
          await handlePlayAudio(message, sendResponse);
          break;
        default:
          throw new Error(`Unknown action: ${action}`);
      }
    } catch (error) {
      handleError(error, sendResponse);
    }
  })();

  return true; // 表示将异步响应
});

const apiUrls = {
  'chatglm': 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  'chatgpt': 'https://api.openai.com/v1/chat/completions',
  'deepseek': 'https://api.deepseek.com/v1/chat/completions',
  'doubao': 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
  'kimi': 'https://api.moonshot.cn/v1/chat/completions',
  'qwen': 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
};

const generateAnalysisPrompt = (sentence) => {
  const content = `
  """
  ${sentence}
  """

  Provide a detailed explanation of how the elements contribute to the overall grammatical structure of the sentence. Additionally, explain the overall English tenses used in the sentence. Finally, output the Mermaid Relationship Diagram Code that illustrates these points.
  `;

  return [{ "role": "user", "content": content }];
};

async function handleStreamResponse(response, tabId, selectedModel, modelName, message) {
  if (!response.ok) {
    let errorMessage = `${selectedModel}🤖 👾${modelName} HTTP error! status: ${response.status}`;

    try {
      const errorResponse = await response.json();
      errorMessage += `, errorResponse: ${JSON.stringify(errorResponse)}`;
    } catch (e) {
      // 如果无法解析JSON，继续使用原始错误消息
      errorMessage += `, errorResponse: ${await response.text()}`;
    }

    throw new Error(errorMessage);
  }

  const actionToTargetClass = {
    'getAnalyze': 'wtl-analyze',
    'getDiagram': 'wtl-diagram',
    'getChatAi': 'wtl-chat-ai',
    'getWordContext': 'wtl-word-context'
  };

  const targetClass = actionToTargetClass[message.action]

  // 发送模型信息开始
  chrome.tabs.sendMessage(tabId, { action: 'streamData', data: `${selectedModel}🤖 👾${modelName}\n\n`, targetClass });

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let content = '';
  let done = false;
  let accumulatedContent = '';
  

  while (!done) {
    const { value, done: readerDone } = await reader.read();
    done = readerDone;
    content += decoder.decode(value, { stream: true });

    // Process the partial content received so far
    const parsedContent = processStreamContent(content);

    if (parsedContent) {
      chrome.tabs.sendMessage(tabId, { action: 'streamData', data: parsedContent, targetClass });
      accumulatedContent += parsedContent;
      // Clear content after processing to avoid reprocessing the same data
      content = '';
    }
  }

  // 发送模型信息结束
  chrome.tabs.sendMessage(tabId, { action: 'streamData', data: `\n\n${selectedModel}🤖 👾${modelName}`, targetClass });

  // Notify content.js that the stream has ended
  chrome.tabs.sendMessage(tabId, { action: 'endStream', targetClass });

  return accumulatedContent;
}

function processStreamContent(content) {
  // Split the content into lines
  const lines = content.split('\n');

  // Process each line and extract the "delta" objects
  const deltaLines = lines
    .filter(line => line.trim().startsWith('data: '))
    .map(line => line.trim().substring('data: '.length))
    .map(line => {
      try {
        return JSON.parse(line);
      } catch (e) {
        return null;
      }
    })
    .filter(json => json && json.choices && json.choices.length > 0)
    .map(json => json.choices[0].delta);

  // Combine all the delta objects into a single response
  const combinedText = deltaLines.map(delta => delta.content).join('');

  return combinedText;
}

async function processAIStream(message, tabId, sendResponse) {
  try {

    const { apiKey, modelName, apiUrl, selectedModel } = await getAIProcessConfig(sendResponse);

    let conversation;
    if (message.action === 'getAnalyze') {
      conversation = generateAnalysisPrompt(message.sentence);
    } else if (message.action === 'getDiagram') {
      conversation = generateDiagramPrompt(message.sentence);
    } else if (message.action === 'getWordContext') {
      conversation = generateWordContextPrompt(message.word);
    } else {
      conversation = message.conversation;
    }

    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ 
        model: modelName, 
        messages: conversation, 
        stream: true
      })
    };

    const response = await fetch(apiUrl, requestOptions);
    const answer = await handleStreamResponse(response, tabId, selectedModel, modelName, message);

    sendResponse({ answer });
  } catch (error) {
    sendResponse({ error: error.message });
  }
}

async function handleAIRequest(message, sendResponse) {
  try {
    const { apiKey, modelName, apiUrl, selectedModel } = await getAIProcessConfig(sendResponse);

    let prompt;
    switch (message.action) {
      case 'getWriting':
        prompt = generateWritingPrompt(message.sentence);
        break;
      default:
        throw new Error(`Unknown action: ${message.action}`);
    }

    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ 
        model: modelName, 
        messages: prompt, 
        stream: false 
      })
    };

    const response = await fetch(apiUrl, requestOptions);
    if (!response.ok) {
      let errorMessage = `${selectedModel}🤖 👾${modelName} HTTP error! status: ${response.status}`;

      try {
        const errorResponse = await response.json();
        errorMessage += `, errorResponse: ${JSON.stringify(errorResponse)}`;
      } catch (e) {
        errorMessage += `, errorResponse: ${await response.text()}`;
      }

      throw new Error(errorMessage);
    }

    const data = await response.json();
    const answer = data.choices[0].message.content;

    sendResponse({ answer });
  } catch (error) {
    handleError(error, sendResponse);
  }
}


async function getAIProcessConfig(sendResponse) {
  const { selectedModel = 'chatglm'} = await chrome.storage.local.get(['selectedModel']);
  const { [`${selectedModel}_apiKey`]: apiKey, [`${selectedModel}_modelName`]: modelName } = await chrome.storage.local.get([`${selectedModel}_apiKey`, `${selectedModel}_modelName`]);
  const apiUrl = apiUrls[selectedModel];

  if (!apiKey || !modelName) {
    sendResponse({ error: '设置不完整。请检查API Key和模型名称。' });
    return {};
  }

  return { apiKey, modelName, apiUrl, selectedModel };
}

async function handleGetCambridge({ word }, sendResponse) {
  try {
    const response = await fetch(`https://dictionary.cambridge.org/dictionary/english-chinese-simplified/${word}`);
    const rawHTML = await response.text();
    sendResponse({ info: rawHTML });
  } catch (error) {
    sendResponse({ error: `${error.message}。Please try opening [https://dictionary.cambridge.org/dictionary/english-chinese-simplified/] to check if it is working correctly.` });
  }
}

async function handleGetCollins({ word }, sendResponse) {
  try {
    const response = await fetch(`https://www.collinsdictionary.com/dictionary/english/${word}`);
    const rawHTML = await response.text();
    sendResponse({ info: rawHTML });
  } catch (error) {
    sendResponse({ error: `${error.message}。Please try opening [https://www.collinsdictionary.com/dictionary/english] to check if it is working correctly.` });
  }
}

async function handleGetConjugations({ word }, sendResponse) {
  try {
    const response = await fetch(`https://www.collinsdictionary.com/conjugation/english/${word}`);
    const rawHTML = await response.text();
    sendResponse({ info: rawHTML });
  } catch (error) {
    sendResponse({ error: `${error.message}。Please try opening [https://www.collinsdictionary.com/conjugation/english/] to check if it is working correctly.` });
  }
}

async function handlePlayAudio({ source }, sendResponse) {
  await createOffscreen();
  chrome.runtime.sendMessage({ play: { source } });
  sendResponse({ status: 'done' });
}

async function createOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Needed to play audio files'
  });
}

function checkAndUpdateReviewDates() {
  chrome.storage.local.get(['user_word', 'today_info'], ({ user_word = [], today_info = { count: 0, date: '' } }) => {
    const today = new Date().toLocaleDateString();

    if (today !== today_info.date) {
      today_info.count = 0;
      today_info.date = today;
    }

    user_word = user_word.map(wordObject => {
      if (wordObject.count === 5 && new Date(today) >= new Date(wordObject.reviewDate)) {
        wordObject.count = 0;
        wordObject.reviewInterval *= 2;
      }
      return wordObject;
    });
    chrome.storage.local.set({ user_word, today_info });
  });
}

function handleError(error, sendResponse) {
  console.error('Error processing AI response:', error);
  sendResponse({ error: error.message });
}

const generateWordContextPrompt = (word) => {
  const content = `
  Create 3 conversations showcasing the usage of the word "${word}" in different contexts. Please directly provide the conversations, and ensure that the vocabulary used in the conversations is limited to common words.
  `
  return [{ "role": "user", "content": content }];
}

const generateDiagramPrompt = (sentence) => {
  const content = `
## Sentence Analysis

Analyze the given sentence using full part-of-speech names instead of abbreviations according to the following structure:

### Sentence:
${sentence}

### Part-of-Speech Tagging Diagram Code
\`\`\`plaintext
<Word1/Part-of-Speech> <Word2/Part-of-Speech> ... <WordN/Part-of-Speech>
\`\`\`

### Graphical Sentence Diagram Code
\`\`\`plaintext
Sentence
├── Subject
│   └── <Subject Phrase>
└── Predicate
    ├── Verb
    │   └── <Verb>
    └── Object/Prepositional Phrase
        └── <Object/Prepositional Phrase>
\`\`\`

### Sentence Pattern Diagram Code
\`\`\`plaintext
[Pattern: S-V-O/PP]
[Subject: <Subject Phrase>]
[Verb: <Verb>]
[Object/Prepositional Phrase: <Object/Prepositional Phrase>]
\`\`\`

### Hierarchical Tree Diagram Code
\`\`\`plaintext
(Sentence
  (Noun Phrase
    (Determiner <Determiner>)
    (Adjective <Adjective>)
    (Noun <Noun>))
  (Verb Phrase
    (Verb <Verb>)
    (Noun Phrase/Prepositional Phrase
      (Adjective/Preposition <Adjective/Preposition>)
      (Noun Phrase
        (Determiner <Determiner>)
        (Adjective <Adjective>)
        (Noun <Noun>))))
  (Punctuation <Punctuation>))
\`\`\`

## Example Usage:

### Sentence:
The open Web presents incredible opportunities for developers.

### Part-of-Speech Tagging Diagram Code
\`\`\`plaintext
The/Determiner open/Adjective Web/Noun presents/Verb incredible/Adjective opportunities/Noun for/Preposition developers/Noun ./Punctuation
\`\`\`

### Graphical Sentence Diagram Code
\`\`\`plaintext
Sentence
├── Subject
│   └── The open Web
└── Predicate
    ├── Verb
    │   └── presents
    └── Object
        ├── Adjective
        │   └── incredible
        └── Noun
            └── opportunities
                └── Prepositional Phrase
                    └── for developers
\`\`\`

### Sentence Pattern Diagram Code
\`\`\`plaintext
[Pattern: S-V-O-PP]
[Subject: The open Web]
[Verb: presents]
[Object: incredible opportunities]
[Prepositional Phrase: for developers]
\`\`\`

### Hierarchical Tree Diagram Code
\`\`\`plaintext
(Sentence
  (Noun Phrase
    (Determiner The)
    (Adjective open)
    (Noun Web))
  (Verb Phrase
    (Verb presents)
    (Noun Phrase
      (Adjective incredible)
      (Noun opportunities)))
  (Prepositional Phrase
    (Preposition for)
    (Noun Phrase
      (Noun developers)))
  (Punctuation .))
\`\`\`
`;

  return [{ "role": "user", "content": content }];
};

const generateWritingPrompt = (sentence) => {
  const content = `
## TASK
Generate HTML code that visualizes the grammatical structure and tenses of a given sentence. The output should include four types of diagrams: Part-of-Speech Tagging, Graphical Sentence Structure, Sentence Pattern, and Hierarchical Tree Structure. Ensure all words in the sentence are enclosed in curly braces {} and use full part-of-speech names. Output the HTML code directly.

### Sentence:
${sentence}

### INSTRUCTIONS:

#### Part-of-Speech Tagging
Generate HTML code for part-of-speech tagging using full part-of-speech names. Enclose each word in curly braces {} and each part-of-speech in square brackets [].

#### Graphical Sentence Structure
Generate HTML code to depict the graphical structure of the sentence, with each word enclosed in curly braces {}.

#### Sentence Pattern
Generate HTML code that identifies and labels the sentence pattern. Enclose each word in curly braces {}.

#### Hierarchical Tree Structure
Generate HTML code to create a hierarchical tree structure representing the sentence. Enclose each word in curly braces {}.

### Output Format
\`\`\`html
<div class="wtl-interactive-container">
  <!-- Part-of-Speech Tagging -->
  <div class="part-of-speech-tagging">
    <pre class="bg-red-100">
      {Word1}[Part-of-Speech] {Word2}[Part-of-Speech] {Word3}[Part-of-Speech] {Word4}[Part-of-Speech] {WordN}[Part-of-Speech] ./Punctuation
    </pre>
  </div>
  
  <!-- Graphical Sentence Structure -->
  <div class="graphical-sentence">
    <pre class="bg-yellow-100">
      Sentence
      ├── Subject
      │   └── {Word1} {Word2} {Word3}
      └── Predicate
          ├── Verb
          │   └── {Word4}
          └── Object
              ├── Adjective
              │   └── {Word5}
              └── Noun
                  └── {Word6}
                      └── Prepositional Phrase
                          └── {Word7} {Word8}
    </pre>
  </div>
  
  <!-- Sentence Pattern -->
  <div class="sentence-pattern">
    <pre class="bg-green-100">
      [Pattern: S-V-O]
      [Subject: {Word1} {Word2} {Word3}]
      [Verb: {Word4}]
      [Object: {Word5} {Word6} {Word7} {Word8}]
    </pre>
  </div>
  
  <!-- Hierarchical Tree Structure -->
  <div class="hierarchical-tree">
    <pre class="bg-blue-100">
      (Sentence
        (Noun Phrase
          (Determiner {Word1})
          (Adjective {Word2})
          (Noun {Word3}))
        (Verb Phrase
          (Verb {Word4})
          (Noun Phrase
            (Adjective {Word5})
            (Noun {Word6})))
        (Prepositional Phrase
          (Preposition {Word7})
          (Noun Phrase
            (Noun {Word8})))
        (Punctuation .))
    </pre>
  </div>
</div>
\`\`\`

### Example Usage

#### Example Sentence:
The open Web presents incredible opportunities for developers.

#### Expected HTML Output:
\`\`\`html
<div class="wtl-interactive-container">
  <!-- Part-of-Speech Tagging -->
  <div class="part-of-speech-tagging">
    <pre class="bg-red-100">
      {The}[Determiner] {open}[Adjective] {Web}[Noun: Singular] {presents}[Verb: Third Person Singular, Present Tense] {incredible}[Adjective] {opportunities}[Noun: Plural] {for}[Preposition] {developers}[Noun: Plural] ./Punctuation
    </pre>
  </div>
  
  <!-- Graphical Sentence Structure -->
  <div class="graphical-sentence">
    <pre class="bg-yellow-100">
      Sentence
      ├── Subject
      │   └── {The} {open} {Web}
      └── Predicate
          ├── Verb
          │   └── {presents}
          └── Object
              ├── Adjective
              │   └── {incredible}
              └── Noun
                  └── {opportunities}
                      └── Prepositional Phrase
                          └── {for} {developers}
    </pre>
  </div>
  
  <!-- Sentence Pattern -->
  <div class="sentence-pattern">
    <pre class="bg-green-100">
      [Pattern: Subject-Verb-Object (S-V-O)]
      [Subject: {The} {open} {Web}]
      [Verb: {presents}]
      [Object: {incredible} {opportunities} {for} {developers}]
    </pre>
  </div>
  
  <!-- Hierarchical Tree Structure -->
  <div class="hierarchical-tree">
    <pre class="bg-blue-100">
      (Sentence
        (Noun Phrase
          (Determiner {The})
          (Adjective {open})
          (Noun {Web}))
        (Verb Phrase
          (Verb {presents})
          (Noun Phrase
            (Adjective {incredible})
            (Noun {opportunities})))
        (Prepositional Phrase
          (Preposition {for})
          (Noun Phrase
            (Noun {developers})))
        (Punctuation .))
    </pre>
  </div>
</div>
\`\`\`
`;
  return [{ "role": "user", "content": content }];
}
