// Run on #design in a disposable browser tab. Preview/read-only checks; no API writes.
(async () => {
  const screen = Studio.screen,
    play = S.play,
    boot = S.boot,
    url = location.href;
  const frame = document.querySelector("#studio-frame");
  try {
    for (const key of Object.keys(pageNames)) {
      Studio.screen = "site:" + key;
      studioRefresh();
      await new Promise((resolve) => setTimeout(resolve, 80));
      const doc = frame.contentDocument;
      if (!doc.querySelector(".public-page main"))
        throw Error("No preview: " + key);
      if (key === "waiting-slide" && !doc.querySelector(".host-wait-panel"))
        throw Error("Wrong slide waiting preview");
      if (
        key === "completed" &&
        (doc.querySelector(".review-list") ||
          doc.querySelector(".finish-score"))
      )
        throw Error("Completion preview reveals results");
      if (key === "new-game" && !doc.querySelector('[data-action="new-team"]'))
        throw Error("No new-game action");
    }
    history.replaceState(null, "", "#play");
    S.boot = {
      ...boot,
      appearance: Object.fromEntries(
        Object.keys(pageNames).map((key, i) => [
          key,
          { ...blankPage(), background: "#" + (100000 + i).toString() },
        ]),
      ),
    };
    const quiz = {
      questions: [],
      cover: {},
      finishLayout: {},
      completionLayout: {},
    };
    for (const [state, key] of [
      [{ waiting: true }, "waiting"],
      [{ waiting: true, newGame: true }, "new-game"],
      [{ started: true, waitingForHost: true }, "waiting-slide"],
      [{ started: false, waitingForHost: true }, "start"],
      [{ done: true, feedback: true }, "finish"],
      [{ done: true, feedback: false }, "completed"],
    ]) {
      S.play = { quiz, answers: [], ...state };
      if (appearanceFor().background !== S.boot.appearance[key].background)
        throw Error("Wrong participant style: " + key);
    }
    const base = {
      ...blankPage(),
      elements: [{ id: "base-decoration" }],
      regions: { title: { text: "Template" } },
    };
    const reset = { ...blankPage(), inherit: false };
    if (
      mergePage(base, reset).elements.length ||
      Object.keys(mergePage(base, reset).regions).length
    )
      throw Error("Reset inherited decorations");
    window.designPagesTest = {
      passed: true,
      pages: Object.keys(pageNames).length,
      participantStates: 6,
      resetInheritance: true,
    };
  } catch (error) {
    window.designPagesTest = { passed: false, error: error.message };
  } finally {
    S.play = play;
    S.boot = boot;
    history.replaceState(null, "", url);
    Studio.screen = screen;
    studioRefresh();
  }
})();
