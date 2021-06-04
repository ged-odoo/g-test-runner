// in case some testing code decides to mock them
const location = window.location;
const setTimeout = window.setTimeout;
const clearTimeout = window.clearTimeout;
const random = Math.random;
const userAgent = navigator.userAgent;

// ---------------------------------------------------------------------------
// Utility, helpers...
// ---------------------------------------------------------------------------

/**
 * Based on Java's String.hashCode, a simple but not
 * rigorously collision resistant hashing function
 *
 * @param {string[]} strings
 * @returns {string}
 */
export function generateHash(strings) {
  const str = strings.join("\x1C");
  let hash = 0;

  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }

  // Convert the possibly negative integer hash code into an 8 character hex
  // string, which isn't strictly necessary but increases user understanding
  // that the id is a SHA-like hash
  let hex = (0x100000000 + hash).toString(16);
  if (hex.length < 8) {
    hex = "0000000" + hex;
  }
  return hex.slice(-8);
}

/**
 * @param {URLSearchParams} params
 * @returns {string}
 */
export function getUrlWithParams(params) {
  const query = params.toString();
  return `${location.pathname}${query ? "?" + query : ""}${location.hash}`;
}

export function escapeHTML(str) {
  const div = document.createElement("div");
  div.innerText = str;
  return div.innerHTML;
}

export function debounce(func, wait, immediate = false) {
  let timeout;
  return function () {
    const context = this;
    const args = arguments;
    function later() {
      if (!immediate) {
        func.apply(context, args);
      }
    }
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) {
      func.apply(context, args);
    }
  };
}

/**
 * This private function computes a score that represent the fact that the
 * string contains the pattern, or not
 *
 * - If the score is 0, the string does not contain the letters of the pattern in
 *   the correct order.
 * - if the score is > 0, it actually contains the letters.
 *
 * Better matches will get a higher score: consecutive letters are better,
 * and a match closer to the beginning of the string is also scored higher.
 */
function match(pattern, str) {
  let totalScore = 0;
  let currentScore = 0;
  let len = str.length;
  let patternIndex = 0;

  pattern = pattern.toLowerCase();
  str = str.toLowerCase();

  for (let i = 0; i < len; i++) {
    if (str[i] === pattern[patternIndex]) {
      patternIndex++;
      currentScore += 100 + currentScore - i / 200;
    } else {
      currentScore = 0;
    }
    totalScore = totalScore + currentScore;
  }

  return patternIndex === pattern.length ? totalScore : 0;
}

/**
 * Return a list of things that matches a pattern, ordered by their 'score' (
 * higher score first). An higher score means that the match is better. For
 * example, consecutive letters are considered a better match.
 */
export function fuzzyLookup(pattern, list, fn) {
  const results = [];
  list.forEach((data) => {
    const score = match(pattern, fn(data));
    if (score > 0) {
      results.push({ score, elem: data });
    }
  });

  // we want better matches first
  results.sort((a, b) => b.score - a.score);

  return results.map((r) => r.elem);
}

export function deepEqual(a, b) {
  if (a === b) {
    return true;
  }

  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) {
        return false;
      }
    }
    return true;
  }

  const keysA = Object.keys(a);
  const keysB = new Set(Object.keys(b));

  if (keysA.length !== keysB.size) {
    return false;
  }

  for (let k of keysA) {
    if (!keysB.has(k)) {
      return false;
    }
    if (!deepEqual(a[k], b[k])) {
      return false;
    }
    return true;
  }
}

export function shuffle(array) {
  let currentIndex = array.length;
  let randomIndex;
  while (0 !== currentIndex) {
    randomIndex = Math.floor(random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
  }
  return array;
}
