// isomorphic — no Bun-only or browser-only APIs in here, so this exact
// function can run server-side (building the initial page) or ship to the
// browser unchanged to re-render later if the underlying data ever changes.
//
// supports {#each x as item}...{/each} and {#each Object.entries(x) as
// [k, v]}...{/each}, nested to any depth — a nested loop can reference
// anything bound by an enclosing one (mod.subs where mod came from the
// outer loop). {item}/{item.path} inside a loop body resolve by dotted
// path; plain text outside any loop is left untouched — that's still
// owned by resolveWidgets' own attribute substitution, same as before.

function lookup(path, scope) {
  const parts = path.split('.');
  if (!(parts[0] in scope)) return undefined;
  let value = scope[parts[0]];
  for (const part of parts.slice(1)) {
    if (value == null) return '';
    value = value[part];
  }
  return value;
}

function interpolate(text, scope) {
  return text.replace(/\{(\w+(?:\.\w+)*)\}/g, (match, path) => {
    const value = lookup(path, scope);
    return value === undefined ? match : value ?? '';
  });
}

// finds the {/each} matching the {#each...} whose body starts at
// fromIndex — naive non-greedy regex matching breaks the moment there's a
// nested {#each}, since it'd stop at the inner {/each} instead. this
// tracks nesting depth to find the real match.
function findMatchingEnd(text, fromIndex) {
  let depth = 1;
  let pos = fromIndex;
  while (depth > 0) {
    const nextOpen = text.indexOf('{#each', pos);
    const nextClose = text.indexOf('{/each}', pos);
    if (nextClose === -1) return -1;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++;
      pos = nextOpen + 6;
    } else {
      depth--;
      pos = nextClose + 7;
      if (depth === 0) return nextClose;
    }
  }
  return -1;
}

const OPEN_RE = /\{#each\s+([^}]+?)\s+as\s+(\[[^\]]+\]|\w+)\}/;

function process(template, scope, insideLoop) {
  let result = '';
  let cursor = 0;

  while (cursor < template.length) {
    const rest = template.slice(cursor);
    const openMatch = OPEN_RE.exec(rest);
    if (!openMatch) {
      result += insideLoop ? interpolate(rest, scope) : rest;
      break;
    }

    const openStart = cursor + openMatch.index;
    const before = template.slice(cursor, openStart);
    result += insideLoop ? interpolate(before, scope) : before;

    const bodyStart = openStart + openMatch[0].length;
    const closeStart = findMatchingEnd(template, bodyStart);
    if (closeStart === -1) {
      const chunk = template.slice(openStart);
      result += insideLoop ? interpolate(chunk, scope) : chunk;
      break;
    }

    const [, exprText, varText] = openMatch;
    const body = template.slice(bodyStart, closeStart);

    const entriesMatch = exprText.trim().match(/^Object\.entries\((\w+(?:\.\w+)*)\)$/);
    const sourcePath = entriesMatch ? entriesMatch[1] : exprText.trim();
    const sourceValue = lookup(sourcePath, scope);

    if (sourceValue === undefined) {
      console.warn(`{#each} references "${sourcePath}", but it wasn't found in scope — rendering empty.`);
    }

    if (entriesMatch) {
      const [keyVar, valVar] = varText.replace(/[[\]\s]/g, '').split(',');
      for (const [k, v] of Object.entries(sourceValue || {})) {
        result += process(body, { ...scope, [keyVar]: k, [valVar]: v }, true);
      }
    } else {
      const itemVar = varText.trim();
      for (const item of sourceValue || []) {
        result += process(body, { ...scope, [itemVar]: item }, true);
      }
    }

    cursor = closeStart + '{/each}'.length;
  }

  return result;
}

export function render(template, data) {
  return process(template, data ?? {}, false);
}
