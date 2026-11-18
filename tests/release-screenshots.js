// Run on #updates in a disposable browser tab with a release containing >=2 screenshots.
(() => {
  const saved = structuredClone(S.updates);
  try {
    const shots = saved.check.release.screenshots;
    if (shots.length < 2) throw Error("Need two screenshot fixtures");
    S.updates.check.release.screenshots = [
      {
        ...shots[0],
        caption: '<img src=x onerror="window.releaseCaptionXSS=1">',
      },
      shots[1],
    ];
    $("#app").innerHTML = updatesPage();
    if (
      $(".release-screenshot-caption img") ||
      !$(".release-screenshot-caption").textContent.includes("<img")
    )
      throw Error("Caption HTML was interpreted");
    $(".release-screenshot").click();
    if (!$("dialog.release-screenshot-dialog[open]"))
      throw Error("Viewer did not open");
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    if ($(".release-viewer").dataset.imageIndex !== "1")
      throw Error("Keyboard next failed");
    $('[data-update-action="screenshot-next"]').click();
    if ($(".release-viewer").dataset.imageIndex !== "0")
      throw Error("Wrap failed");
    const image = $(".release-viewer img");
    image.dispatchEvent(new Event("error"));
    if (!image.hidden || $(".release-viewer .release-image-error").hidden)
      throw Error("Viewer error fallback missing");
    $("dialog").close();
    const thumb = $(".release-screenshot img");
    thumb.dispatchEvent(new Event("error"));
    if (!thumb.hidden || $(".release-screenshot .release-image-error").hidden)
      throw Error("Thumbnail error fallback missing");
    if ($('[data-update-action="check"]').disabled)
      throw Error("Image failure blocked updates");
    S.updates.check.release.screenshots = [];
    $("#app").innerHTML = updatesPage();
    if ($(".release-screenshots"))
      throw Error("Empty gallery should not render");
    if (window.releaseCaptionXSS) throw Error("Caption injection");
    window.releaseScreenshotsTest = {
      passed: true,
      viewer: true,
      keyboard: true,
      wrap: true,
      captionEscaping: true,
      errorFallback: true,
      legacyRelease: true,
    };
  } catch (error) {
    window.releaseScreenshotsTest = { passed: false, error: error.message };
  } finally {
    $("dialog")?.remove();
    S.updates = saved;
    $("#app").innerHTML = updatesPage();
  }
})();
