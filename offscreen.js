chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if ('play' in msg) {
    playAudio(msg.play);
    sendResponse(true);
  }
  return true;
});

let audio = null;

function playAudio({ source }) {
  audio = new Audio(source);
  audio.play();
}
