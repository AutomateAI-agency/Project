/* AI Voice Studio — Web Speech API
 * Single JS file handling both SpeechRecognition (STT) and speechSynthesis (TTS).
 * Notes:
 * - SpeechRecognition is prefixed as webkitSpeechRecognition in most browsers.
 * - speechSynthesis voices are provided by the OS/browser; availability varies.
 */

(() => {
  // ---------- Helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const setBadge = (el, ok) => {
    el.textContent = ok ? "supported" : "not supported";
    el.classList.toggle("text-bg-success", ok);
    el.classList.toggle("text-bg-danger", !ok);
  };
  const saveTextFile = (filename, content) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // ---------- Elements ----------
  const sttDot = $("#sttStatusDot");
  const sttBadge = $("#sttSupport");
  const sttMsg = $("#sttMsg");
  const recLang = $("#recLang");
  const optContinuous = $("#optContinuous");
  const optInterim = $("#optInterim");
  const btnStart = $("#btnStart");
  const btnStop = $("#btnStop");
  const btnClear = $("#btnClear");
  const btnSaveTxt = $("#btnSaveTxt");
  const transcript = $("#transcript");

  const ttsDot = $("#ttsStatusDot");
  const ttsBadge = $("#ttsSupport");
  const ttsMsg = $("#ttsMsg");
  const voiceSelect = $("#voiceSelect");
  const btnRefreshVoices = $("#btnRefreshVoices");
  const rate = $("#rate"), pitch = $("#pitch"), volume = $("#volume");
  const rateVal = $("#rateVal"), pitchVal = $("#pitchVal"), volumeVal = $("#volumeVal");
  const speakText = $("#speakText");
  const btnSpeak = $("#btnSpeak"), btnPause = $("#btnPause"), btnResume = $("#btnResume"), btnCancel = $("#btnCancel");

  // ---------- STT: SpeechRecognition ----------
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let recognizing = false;

  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = optContinuous.checked;
    recognition.interimResults = optInterim.checked;
    recognition.lang = recLang.value;

    recognition.onstart = () => {
      recognizing = true;
      sttDot.classList.add("live");
      btnStart.disabled = true;
      btnStop.disabled = false;
      sttMsg.textContent = "Listening… speak clearly into your microphone.";
    };

    recognition.onend = () => {
      recognizing = false;
      sttDot.classList.remove("live");
      btnStart.disabled = false;
      btnStop.disabled = true;
      sttMsg.textContent = "Recognition stopped.";
    };

    recognition.onresult = (event) => {
      let interim = "";
      let final = transcript.value;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const txt = res[0].transcript;
        if (res.isFinal) final += (final && !final.endsWith("\n") ? " " : "") + txt.trim();
        else interim += txt;
      }
      transcript.value = final + (interim ? "\n" + "[…] " + interim : "");
      transcript.scrollTop = transcript.scrollHeight;
    };

    recognition.onerror = (e) => {
      const msg = e.error === "no-speech" ? "No speech detected." :
                  e.error === "audio-capture" ? "No microphone found / permission denied." :
                  e.error === "not-allowed" ? "Permission to use microphone was denied." :
                  `Error: ${e.error}`;
      sttMsg.textContent = msg;
    };

    // Reflect UI options
    recLang.addEventListener("change", () => recognition.lang = recLang.value);
    optContinuous.addEventListener("change", () => recognition.continuous = optContinuous.checked);
    optInterim.addEventListener("change", () => recognition.interimResults = optInterim.checked);

    btnStart.addEventListener("click", () => {
      try { recognition.start(); }
      catch { /* starting while active throws; ignore */ }
    });

    btnStop.addEventListener("click", () => {
      try { recognition.stop(); } catch {}
    });

  } else {
    btnStart.disabled = true; btnStop.disabled = true;
    sttMsg.textContent = "Speech recognition is not supported in this browser.";
  }

  btnClear.addEventListener("click", () => { transcript.value = ""; });
  btnSaveTxt.addEventListener("click", () => saveTextFile("transcript.txt", transcript.value));
  setBadge(sttBadge, !!SpeechRecognition);

  // ---------- TTS: speechSynthesis ----------
  const synth = window.speechSynthesis;
  let voices = [];

  const populateVoices = () => {
    voices = synth ? synth.getVoices() : [];
    voiceSelect.innerHTML = "";
    if (!voices.length) {
      const opt = document.createElement("option");
      opt.textContent = "No voices available (try Refresh after a second)";
      opt.disabled = true; opt.selected = true;
      voiceSelect.appendChild(opt);
      return;
    }

    // Group by lang, sort by name
    voices.sort((a,b) => (a.lang||"").localeCompare(b.lang||"") || a.name.localeCompare(b.name));
    for (const v of voices) {
      const opt = document.createElement("option");
      opt.value = v.name;
      opt.textContent = `${v.name} — ${v.lang}${v.default ? " (default)" : ""}`;
      opt.dataset.lang = v.lang;
      voiceSelect.appendChild(opt);
    }

    // Select a sensible default matching STT language if possible
    const match = Array.from(voiceSelect.options).find(o => (o.dataset.lang || "").startsWith(recLang.value.split("-")[0]));
    if (match) voiceSelect.value = match.value;
  };

  if (synth) {
    setBadge(ttsBadge, true);
    // voiceschanged may fire asynchronously (especially on Chrome)
    synth.onvoiceschanged = () => populateVoices();
    // Attempt immediate population too
    populateVoices();
  } else {
    setBadge(ttsBadge, false);
    btnSpeak.disabled = true; btnPause.disabled = true; btnResume.disabled = true; btnCancel.disabled = true;
    ttsMsg.textContent = "Speech synthesis not supported in this browser.";
  }

  btnRefreshVoices.addEventListener("click", populateVoices);

  const reflectSliderValues = () => {
    rateVal.textContent = Number(rate.value).toFixed(1);
    pitchVal.textContent = Number(pitch.value).toFixed(1);
    volumeVal.textContent = Number(volume.value).toFixed(1);
  };
  reflectSliderValues();
  [rate, pitch, volume].forEach(el => el.addEventListener("input", reflectSliderValues));

  let currentUtterance = null;

  const setSpeakingUI = (speaking) => {
    ttsDot.classList.toggle("live", speaking);
    btnSpeak.disabled = speaking;
    btnPause.disabled = !speaking;
    btnCancel.disabled = !speaking;
    btnResume.disabled = true; // enabled only when paused
  };

  btnSpeak.addEventListener("click", () => {
    const text = (speakText.value || "").trim();
    if (!text) {
      ttsMsg.textContent = "Please type some text to speak.";
      return;
    }
    if (!synth) return;

    // If already speaking, cancel previous
    if (synth.speaking) synth.cancel();

    const utt = new SpeechSynthesisUtterance(text);
    currentUtterance = utt;

    // Voice
    const selected = voices.find(v => v.name === voiceSelect.value);
    if (selected) utt.voice = selected;

    // Params
    utt.rate = Number(rate.value);
    utt.pitch = Number(pitch.value);
    utt.volume = Number(volume.value);
    // Try to align language with selected voice, fallback to recognition lang
    utt.lang = (selected && selected.lang) || recLang.value;

    // Events
    utt.onstart = () => {
      setSpeakingUI(true);
      ttsMsg.textContent = `Speaking${selected ? ` with ${selected.name}` : ""}…`;
    };
    utt.onend = () => {
      setSpeakingUI(false);
      ttsMsg.textContent = "Done.";
    };
    utt.onerror = (e) => {
      setSpeakingUI(false);
      ttsMsg.textContent = `TTS error: ${e.error || "unknown"}.`;
    };
    utt.onpause = () => { btnResume.disabled = false; ttsMsg.textContent = "Paused."; };
    utt.onresume = () => { btnResume.disabled = true; ttsMsg.textContent = "Resumed."; };

    synth.speak(utt);
  });

  btnPause.addEventListener("click", () => {
    if (synth && synth.speaking && !synth.paused) {
      synth.pause();
      btnResume.disabled = false;
    }
  });

  btnResume.addEventListener("click", () => {
    if (synth && synth.paused) {
      synth.resume();
      btnResume.disabled = true;
    }
  });

  btnCancel.addEventListener("click", () => {
    if (synth && (synth.speaking || synth.paused)) {
      synth.cancel();
      setSpeakingUI(false);
      ttsMsg.textContent = "Stopped.";
    }
  });

  // Initial status indicators
  if (SpeechRecognition) { sttMsg.textContent = "Ready."; } else { sttMsg.textContent = "SpeechRecognition unsupported."; }
  if (synth) { ttsMsg.textContent = "Voices load asynchronously. Click Refresh if the list is empty."; }

  // Accessibility: stop recognition/speaking when page hides (optional safety)
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      try { recognition && recognizing && recognition.stop(); } catch {}
      try { synth && (synth.speaking || synth.paused) && synth.cancel(); } catch {}
    }
  });
})();
