(function () {
  if (!Object.fromEntries) {
    Object.fromEntries = function (entries) {
      if (entries == null) {
        throw new TypeError('Object.fromEntries requires an iterable');
      }
      var obj = {};
      if (Array.isArray(entries) || typeof entries.length === 'number') {
        for (var i = 0; i < entries.length; i += 1) {
          var entry = entries[i];
          if (entry && entry.length >= 2) {
            obj[entry[0]] = entry[1];
          }
        }
        return obj;
      }
      if (typeof Symbol !== 'undefined' && entries[Symbol.iterator]) {
        var iterator = entries[Symbol.iterator]();
        var step;
        while (!(step = iterator.next()).done) {
          var pair = step.value;
          if (pair && pair.length >= 2) {
            obj[pair[0]] = pair[1];
          }
        }
      }
      return obj;
    };
  }

  if (typeof Promise !== 'undefined' && !Promise.prototype.finally) {
    Promise.prototype.finally = function (onFinally) {
      if (typeof onFinally !== 'function') {
        return this.then(onFinally, onFinally);
      }
      var P = this.constructor;
      return this.then(
        function (value) {
          return P.resolve(onFinally()).then(function () {
            return value;
          });
        },
        function (reason) {
          return P.resolve(onFinally()).then(function () {
            throw reason;
          });
        }
      );
    };
  }

  if (typeof Element !== 'undefined' && !Element.prototype.replaceChildren) {
    Element.prototype.replaceChildren = function () {
      while (this.firstChild) {
        this.removeChild(this.firstChild);
      }
      if (this.append) {
        this.append.apply(this, arguments);
        return;
      }
      for (var i = 0; i < arguments.length; i += 1) {
        var node = arguments[i];
        if (node == null) {
          continue;
        }
        if (typeof node === 'string') {
          this.appendChild(document.createTextNode(node));
          continue;
        }
        if (node && node.nodeType) {
          this.appendChild(node);
          continue;
        }
        this.appendChild(document.createTextNode(String(node)));
      }
    };
  }

  var g = typeof window !== 'undefined' ? window : undefined;
  if (g && !g.AbortController) {
    var AbortController = function () {
      this.signal = {
        aborted: false,
        onabort: null,
        addEventListener: function () {},
        removeEventListener: function () {},
        dispatchEvent: function () {
          return false;
        },
      };
    };
    AbortController.prototype.abort = function () {
      if (this.signal.aborted) {
        return;
      }
      this.signal.aborted = true;
      if (typeof this.signal.onabort === 'function') {
        try {
          this.signal.onabort();
        } catch (err) {
          // no-op
        }
      }
    };
    g.AbortController = AbortController;
    g.AbortSignal = g.AbortSignal || function () {};
  }

  var supportsScrollToOptions = false;
  if (typeof document !== 'undefined') {
    try {
      var testEl = document.createElement('div');
      if (testEl && typeof testEl.scrollTo === 'function') {
        testEl.scrollTo({ top: 0, left: 0 });
        supportsScrollToOptions = true;
      }
    } catch (err) {
      supportsScrollToOptions = false;
    }
  }

  var installScrollTo = function (proto) {
    if (!proto) {
      return;
    }
    var nativeScrollTo = proto.scrollTo;
    if (typeof nativeScrollTo !== 'function') {
      proto.scrollTo = function (x, y) {
        if (x && typeof x === 'object') {
          var left = x.left;
          var top = x.top;
          if (left == null) {
            left = this.scrollLeft;
          }
          if (top == null) {
            top = this.scrollTop;
          }
          this.scrollLeft = left;
          this.scrollTop = top;
          return;
        }
        if (x != null) {
          this.scrollLeft = x;
        }
        if (y != null) {
          this.scrollTop = y;
        }
      };
      return;
    }
    if (supportsScrollToOptions) {
      return;
    }
    proto.scrollTo = function (x, y) {
      if (x && typeof x === 'object') {
        var left = x.left;
        var top = x.top;
        if (left == null) {
          left = this.scrollLeft;
        }
        if (top == null) {
          top = this.scrollTop;
        }
        this.scrollLeft = left;
        this.scrollTop = top;
        return;
      }
      return nativeScrollTo.call(this, x, y);
    };
  };

  if (typeof Element !== 'undefined') {
    installScrollTo(Element.prototype);
  }
  if (typeof HTMLElement !== 'undefined') {
    installScrollTo(HTMLElement.prototype);
  }
})();
