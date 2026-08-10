(function () {
  var root = document.documentElement;
  var color = "teal";
  var preference = "system";
  var mode = "light";

  try {
    var storedColor = localStorage.getItem("wikios:color-theme");
    if (storedColor === "teal" || storedColor === "blue" || storedColor === "violet") {
      color = storedColor;
    }

    var storedMode = localStorage.getItem("wikios:theme-mode");
    if (storedMode === "light" || storedMode === "dark") {
      preference = storedMode;
    }
  } catch {
    // Use the safe defaults when storage is unavailable.
  }

  if (preference === "dark") {
    mode = "dark";
  } else if (preference === "system") {
    try {
      mode = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {
      // Light is the safe fallback when media queries are unavailable.
    }
  }

  root.setAttribute("data-color-theme", color);
  root.setAttribute("data-mode", mode);

  var themeColors = {
    teal: { light: "#ebf6f7", dark: "#142426" },
    blue: { light: "#eef4fb", dark: "#141d2b" },
    violet: { light: "#f4f2fb", dark: "#201a2b" },
  };
  var themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) {
    themeColor.setAttribute("content", themeColors[color][mode]);
  }
})();
