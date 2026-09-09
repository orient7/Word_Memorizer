(() => {
	"use strict";

	/*
	 * Word Memorizer - app.js
	 *
	 * マルチデバイス対応:
	 * - タッチ端末でも操作しやすいようにキーボード依存を最小化
	 * - 仮想キーボード表示時のレイアウト変化を考慮
	 * - orientationchange / resize に対応
	 *
	 * なめらかな自動スクロール:
	 * - 問題表示時は問題エリアへスクロール
	 * - 答え合わせ後は結果エリアへスクロール
	 * - 次の問題へ進む際は問題エリアへスクロール
	 * - スクロール先が端末の表示領域外にならないよう調整
	 */

	const $ = (id) => document.getElementById(id);

	const setupScreen = $("setup-screen");
	const quizScreen = $("quiz-screen");
	const finishScreen = $("finish-screen");
	const startNumber = $("start-number");
	const endNumber = $("end-number");
	const rangeInfo = $("range-info");
	const startButton = $("start-button");
	const progress = $("progress");
	const score = $("score");
	const meaningQuestion = $("meaning-question");
	const answerInput = $("answer-input");
	const answerButton = $("answer-button");
	const resultCard = $("result-card");
	const resultStatus = $("result-status");
	const correctWord = $("correct-word");
	const correctMeaning = $("correct-meaning");
	const typedAnswerArea = $("typed-answer-area");
	const typedWord = $("typed-word");
	const typedMeaning = $("typed-meaning");
	const nextButton = $("next-button");
	const accuracy = $("accuracy");
	const finishDetail = $("finish-detail");
	const retryButton = $("retry-button");
	const homeButton = $("home-button");
	const toast = $("toast");

	let queue = [];
	let currentIndex = 0;
	let correctCount = 0;
	let wrongWords = [];
	let answered = false;

	const wordBySpelling = new Map(
		WORDS.map(word => [normalize(word.word), word])
	);

	// ---------------------------------------------------------------------------
	// Device / viewport helpers
	// ---------------------------------------------------------------------------

	function setupViewportBehavior() {
		// VisualViewport API が使える端末では、
		// ソフトウェアキーボード表示時にも入力欄が見えるようにする。
		if (window.visualViewport) {
			window.visualViewport.addEventListener("resize", () => {
				if (document.activeElement === answerInput && !answered) {
					scheduleScrollTo(answerInput, {
						block: "center",
						delay: 80
					});
				}
			});

			window.visualViewport.addEventListener("scroll", () => {
				if (document.activeElement === answerInput && !answered) {
					scheduleScrollTo(answerInput, {
						block: "center",
						delay: 0
					});
				}
			});
		}

		// スマートフォン・タブレットの回転にも対応。
		window.addEventListener("orientationchange", () => {
			window.setTimeout(() => {
				if (quizScreen.classList.contains("active")) {
					if (answered) {
						scheduleScrollTo(resultCard, { block: "start", delay: 100 });
					} else {
						scheduleScrollTo(answerInput, { block: "center", delay: 100 });
					}
				}
			}, 120);
		});

		window.addEventListener("resize", () => {
			// PCのリサイズではスクロールを強制しない。
			// 入力中のモバイル端末だけ軽く位置を補正する。
			if (
				quizScreen.classList.contains("active") &&
				!answered &&
				document.activeElement === answerInput &&
				isTouchDevice()
			) {
				scheduleScrollTo(answerInput, {
					block: "center",
					delay: 100
				});
			}
		});
	}

	function isTouchDevice() {
		return (
			"ontouchstart" in window ||
			navigator.maxTouchPoints > 0 ||
			navigator.msMaxTouchPoints > 0
		);
	}

	// ---------------------------------------------------------------------------
	// Smooth automatic scrolling
	// ---------------------------------------------------------------------------

	let scrollTimer = null;

	function scheduleScrollTo(element, options = {}) {
		if (!element || !element.isConnected) return;

		const {
			block = "center",
			delay = 0
		} = options;

		window.clearTimeout(scrollTimer);

		scrollTimer = window.setTimeout(() => {
			smoothScrollToElement(element, block);
		}, delay);
	}

	function smoothScrollToElement(element, block = "center") {
		if (!element || !element.isConnected) return;

		// scrollIntoView が利用できる現代ブラウザを基本とする。
		// behavior: smooth により、問題間の移動を自然につなげる。
		try {
			element.scrollIntoView({
				behavior: "smooth",
				block,
				inline: "nearest"
			});
			return;
		} catch (_) {
			// 古いブラウザ向けフォールバック
		}

		const rect = element.getBoundingClientRect();
		const currentY = window.pageYOffset || document.documentElement.scrollTop;
		const targetY = Math.max(
			0,
			currentY + rect.top - (window.innerHeight - rect.height) / 2
		);

		window.scrollTo({
			top: targetY,
			behavior: "smooth"
		});
	}

	function scrollForQuestion() {
		// まずカード全体を画面内に入れ、
		// 少し遅れて入力欄へフォーカスする。
		scheduleScrollTo(meaningQuestion, {
			block: "center",
			delay: 50
		});

		window.setTimeout(() => {
			if (!answered && quizScreen.classList.contains("active")) {
				answerInput.focus({ preventScroll: true });
			}
		}, 220);
	}

	function scrollForResult() {
		// 答え合わせ後は結果を自然に画面中央へ。
		scheduleScrollTo(resultCard, {
			block: "center",
			delay: 40
		});
	}

	function scrollForFinish() {
		scheduleScrollTo(finishScreen, {
			block: "center",
			delay: 50
		});
	}

	// ---------------------------------------------------------------------------
	// General helpers
	// ---------------------------------------------------------------------------

	function normalize(value) {
		return value
			.trim()
			.toLowerCase()
			.replace(/[’‘]/g, "'")
			.replace(/\s+/g, " ");
	}

	function shuffle(array) {
		const copy = [...array];

		for (let i = copy.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[copy[i], copy[j]] = [copy[j], copy[i]];
		}

		return copy;
	}

	function showScreen(screen) {
		[setupScreen, quizScreen, finishScreen].forEach(s => {
			s.classList.remove("active");
		});

		screen.classList.add("active");

		// 画面切り替え時は上方向へ滑らかに戻す。
		window.scrollTo({
			top: 0,
			behavior: "smooth"
		});
	}

	function updateRangeInfo() {
		const start = Number(startNumber.value);
		const end = Number(endNumber.value);

		const count = WORDS.filter(
			word => word.id >= start && word.id <= end
		).length;

		rangeInfo.textContent = count
			? `${count}語を出題します。`
			: "この範囲に単語がありません。";
	}

	// ---------------------------------------------------------------------------
	// Quiz
	// ---------------------------------------------------------------------------

	function startQuiz(words) {
		queue = shuffle(words);
		currentIndex = 0;
		correctCount = 0;
		wrongWords = [];

		showScreen(quizScreen);

		// DOMの表示が切り替わった後にスクロールする。
		window.setTimeout(showQuestion, 80);
	}

	function showQuestion() {
		answered = false;

		const current = queue[currentIndex];

		progress.textContent = `${currentIndex + 1} / ${queue.length}`;
		score.textContent = `正解 ${correctCount}`;
		meaningQuestion.textContent = current.meaning;

		answerInput.value = "";
		answerInput.disabled = false;
		answerButton.disabled = false;
		answerButton.textContent = "答え合わせ";

		resultCard.classList.add("hidden");
		typedAnswerArea.classList.add("hidden");

		// 問題を画面中央へ移動。
		scrollForQuestion();
	}

	function submitAnswer() {
		if (answered) return;

		const current = queue[currentIndex];
		const typed = answerInput.value.trim();

		if (!typed) {
			showToast("英単語を入力してください。");
			answerInput.focus({ preventScroll: true });

			scheduleScrollTo(answerInput, {
				block: "center",
				delay: 40
			});

			return;
		}

		answered = true;

		const isCorrect =
			normalize(typed) === normalize(current.word);

		if (!isCorrect) {
			wrongWords.push(current);
		} else {
			correctCount++;
		}

		answerInput.disabled = true;
		answerButton.disabled = true;
		answerButton.textContent = "答え合わせ済み";

		resultStatus.textContent = isCorrect
			? "正解！"
			: "不正解";

		resultStatus.className =
			`result-status ${isCorrect ? "correct" : "incorrect"}`;

		correctWord.textContent = current.word;
		correctMeaning.textContent = current.meaning;

		// 入力した別の単語が単語データに存在する場合、
		// その単語の意味も表示する。
		const typedData = wordBySpelling.get(normalize(typed));

		if (!isCorrect && typedData) {
			typedAnswerArea.classList.remove("hidden");
			typedWord.textContent = typedData.word;
			typedMeaning.textContent = typedData.meaning;
		}

		resultCard.classList.remove("hidden");

		playResultSound(isCorrect);
		speakWord(current.word);

		// 答え合わせ結果へ自動スクロール。
		scrollForResult();

		nextButton.textContent =
			currentIndex === queue.length - 1
				? "結果を見る"
				: "次の問題";
	}

	function nextQuestion() {
		if (!answered) return;

		currentIndex++;

		if (currentIndex >= queue.length) {
			finishQuiz();
			return;
		}

		// 少し間を置いて、結果表示から次の問題へ滑らかにつなげる。
		window.setTimeout(showQuestion, 100);
	}

	function finishQuiz() {
		showScreen(finishScreen);

		const total = queue.length;
		const rate = total
			? Math.round((correctCount / total) * 100)
			: 0;

		accuracy.textContent = `${rate}%`;
		finishDetail.textContent =
			`${correctCount} / ${total} 問正解`;

		retryButton.classList.toggle(
			"hidden",
			wrongWords.length === 0
		);

		window.setTimeout(scrollForFinish, 100);
	}

	// ---------------------------------------------------------------------------
	// Sound
	// ---------------------------------------------------------------------------

	function playResultSound(isCorrect) {
		try {
			const AudioContext =
				window.AudioContext ||
				window.webkitAudioContext;

			if (!AudioContext) return;

			const ctx = new AudioContext();
			const now = ctx.currentTime;

			// iOS / Android の一部ブラウザで
			// suspended になる場合に備える。
			if (ctx.state === "suspended") {
				ctx.resume().catch(() => { });
			}

			if (isCorrect) {
				playTone(ctx, 660, now, 0.09);
				playTone(ctx, 880, now + 0.1, 0.14);
			} else {
				playTone(ctx, 220, now, 0.16, "sawtooth");
				playTone(ctx, 165, now + 0.13, 0.2, "sawtooth");
			}

			window.setTimeout(() => {
				ctx.close().catch(() => { });
			}, 500);
		} catch (_) {
			// 音声が利用できなくてもアプリ本体は継続する。
		}
	}

	function playTone(
		ctx,
		frequency,
		start,
		duration,
		type = "sine"
	) {
		const oscillator = ctx.createOscillator();
		const gain = ctx.createGain();

		oscillator.type = type;
		oscillator.frequency.setValueAtTime(
			frequency,
			start
		);

		gain.gain.setValueAtTime(
			0.0001,
			start
		);

		gain.gain.exponentialRampToValueAtTime(
			0.12,
			start + 0.01
		);

		gain.gain.exponentialRampToValueAtTime(
			0.0001,
			start + duration
		);

		oscillator.connect(gain);
		gain.connect(ctx.destination);

		oscillator.start(start);
		oscillator.stop(start + duration + 0.02);
	}

	// ---------------------------------------------------------------------------
	// Speech
	// ---------------------------------------------------------------------------

	function speakWord(word) {
		if (!("speechSynthesis" in window)) return;

		window.speechSynthesis.cancel();

		const utterance =
			new SpeechSynthesisUtterance(word);

		utterance.lang = "en-US";
		utterance.rate = 0.85;
		utterance.pitch = 1;

		window.speechSynthesis.speak(utterance);
	}

	// ---------------------------------------------------------------------------
	// Toast
	// ---------------------------------------------------------------------------

	function showToast(message) {
		toast.textContent = message;
		toast.classList.add("show");

		clearTimeout(showToast.timer);

		showToast.timer = window.setTimeout(() => {
			toast.classList.remove("show");
		}, 1800);
	}

	// ---------------------------------------------------------------------------
	// Events
	// ---------------------------------------------------------------------------

	startNumber.addEventListener("input", updateRangeInfo);
	endNumber.addEventListener("input", updateRangeInfo);

	startButton.addEventListener("click", () => {
		const start = Number(startNumber.value);
		const end = Number(endNumber.value);

		if (
			!Number.isInteger(start) ||
			!Number.isInteger(end) ||
			start > end
		) {
			showToast("出題範囲を正しく指定してください。");
			return;
		}

		const selected = WORDS.filter(
			word => word.id >= start && word.id <= end
		);

		if (!selected.length) {
			showToast("この範囲に単語がありません。");
			return;
		}

		startQuiz(selected);
	});

	answerButton.addEventListener("click", submitAnswer);

	nextButton.addEventListener("click", nextQuestion);

	window.addEventListener("keydown", event => {
		if (event.key !== "Enter") return;

		event.preventDefault();

		if (!answered) {
			submitAnswer();
		} else {
			nextQuestion();
		}
	});

	retryButton.addEventListener("click", () => {
		startQuiz(wrongWords);
	});

	homeButton.addEventListener("click", () => {
		showScreen(setupScreen);
		updateRangeInfo();
	});

	// スマートフォン・タブレットでのキーボード対応など。
	setupViewportBehavior();

	updateRangeInfo();
})();
