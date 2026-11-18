// Run in the application's browser console on a disposable tab.
// Uses fixture responses only; never writes teams or answers to the server.
(async () => {
  const originalApi = api;
  clearInterval(poll);
  try {
    const questions = Array.from({ length: 20 }, (_, i) => ({
      id: `scroll-q${i}`,
      text: `Вопрос ${i + 1}`,
      type: "single",
      options: ["Ответ А", "Ответ Б"],
      correct: [1],
      points: 1,
    }));
    const fixture = {
      run: { id: "scroll-test-run", started: 1, ended: null },
      history: [],
      now: 100,
      quiz: { title: "Проверка прокрутки", questions },
      teams: Array.from({ length: 40 }, (_, i) => ({
        id: `scroll-team${i}`,
        name: `Команда ${i + 1}`,
        score: 0,
        seen: 100,
        answers: questions.map((q) => ({
          question_id: q.id,
          value: [0],
          final: 1,
          correct: 0,
          score: 0,
          similarity: 0,
        })),
      })),
    };
    S.monitor = fixture;
    document.querySelector("#app").innerHTML = monitor(fixture);
    let table = document.querySelector(".table-scroll");
    table.scrollLeft = 600;
    table.scrollTop = 200;
    let deliver;
    api = () =>
      new Promise((resolve) => {
        deliver = resolve;
      });
    const pending = refreshMonitor();
    // Continue scrolling during the request, as a host would do in real use.
    table.scrollLeft = 1200;
    table.scrollTop = 400;
    const expected = [table.scrollLeft, table.scrollTop];
    function checkPinnedColumns() {
      const heads = [...document.querySelectorAll(".monitor-table thead th")];
      if (
        heads[0].textContent !== "Баллы" ||
        heads[1].textContent !== "Команда"
      )
        throw Error("Wrong column order");
      const score = document
        .querySelector(".monitor-table tbody .monitor-score-cell")
        .getBoundingClientRect();
      const team = document
        .querySelector(".monitor-table tbody .monitor-team-cell")
        .getBoundingClientRect();
      if (Math.abs(score.left - table.getBoundingClientRect().left) > 2)
        throw Error("Score column scrolled away");
      if (Math.abs(team.left - score.right) > 2)
        throw Error("Team column overlaps scores or scrolled away");
    }
    checkPinnedColumns();
    const updated = structuredClone(fixture);
    updated.teams[0].answers[0].value = [1];
    updated.teams[0].score = 5;
    deliver(updated);
    await pending;
    table = document.querySelector(".table-scroll");
    if (table.scrollLeft !== expected[0] || table.scrollTop !== expected[1])
      throw Error("Scroll was reset after response");
    if (!document.querySelector(".answer-cell").textContent.includes("Ответ Б"))
      throw Error("Answer failed to update");
    checkPinnedColumns();
    if (
      document.querySelector(".monitor-table tbody .score").textContent !== "5"
    )
      throw Error("Pinned score failed to update");
    api = async () => updated;
    for (let i = 0; i < 3; i++) {
      await refreshMonitor();
      table = document.querySelector(".table-scroll");
      if (table.scrollLeft !== expected[0] || table.scrollTop !== expected[1])
        throw Error("Repeated update reset scroll");
      checkPinnedColumns();
    }
    api = async () => ({
      ...fixture,
      run: { ...fixture.run, id: "another-run" },
    });
    await refreshMonitor();
    table = document.querySelector(".table-scroll");
    if (table.scrollLeft || table.scrollTop)
      throw Error("A different run should start at the beginning");
    window.monitorScrollTest = {
      passed: true,
      horizontal: expected[0],
      vertical: expected[1],
      repeatedUpdates: 3,
      answersUpdated: true,
      newRunReset: true,
      pinnedScoreAndTeam: true,
      scoreUpdated: true,
    };
  } catch (error) {
    window.monitorScrollTest = { passed: false, error: error.message };
  } finally {
    api = originalApi;
  }
})();
