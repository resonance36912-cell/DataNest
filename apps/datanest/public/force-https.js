(function () {
  if (
    window.location.protocol === "http:" &&
    window.location.hostname === "datanest-supository.github.io"
  ) {
    window.location.replace(
      "https://" +
        window.location.host +
        window.location.pathname +
        window.location.search +
        window.location.hash
    );
    return;
  }

  var location = window.location;
  if (location.hostname !== "datanest-supository.github.io") return;

  var params = new URLSearchParams(location.search);
  var release = params.get("release");
  var reloadValue = params.get("_reload");
  var reloadAt = reloadValue ? Number(reloadValue) : NaN;
  var staleAfterMs = 15 * 60 * 1000;

  if (
    release &&
    Number.isFinite(reloadAt) &&
    Date.now() - reloadAt > staleAfterMs
  ) {
    params.delete("release");
    params.set("_reload", String(Date.now()));
    var query = params.toString();

    location.replace(
      location.protocol +
        "//" +
        location.host +
        location.pathname +
        (query ? "?" + query : "") +
        location.hash
    );
  }
})();
