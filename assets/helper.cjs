"use strict";
var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// node_modules/uuid/dist/rng.js
var require_rng = __commonJS({
  "node_modules/uuid/dist/rng.js"(exports2, module2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", {
      value: true
    });
    exports2.default = rng;
    var _crypto = _interopRequireDefault(require("crypto"));
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    function rng() {
      return _crypto.default.randomBytes(16);
    }
    module2.exports = exports2.default;
  }
});

// node_modules/uuid/dist/bytesToUuid.js
var require_bytesToUuid = __commonJS({
  "node_modules/uuid/dist/bytesToUuid.js"(exports2, module2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", {
      value: true
    });
    exports2.default = void 0;
    var byteToHex = [];
    for (i2 = 0; i2 < 256; ++i2) {
      byteToHex[i2] = (i2 + 256).toString(16).substr(1);
    }
    var i2;
    function bytesToUuid(buf, offset) {
      var i3 = offset || 0;
      var bth = byteToHex;
      return [bth[buf[i3++]], bth[buf[i3++]], bth[buf[i3++]], bth[buf[i3++]], "-", bth[buf[i3++]], bth[buf[i3++]], "-", bth[buf[i3++]], bth[buf[i3++]], "-", bth[buf[i3++]], bth[buf[i3++]], "-", bth[buf[i3++]], bth[buf[i3++]], bth[buf[i3++]], bth[buf[i3++]], bth[buf[i3++]], bth[buf[i3++]]].join("");
    }
    var _default = bytesToUuid;
    exports2.default = _default;
    module2.exports = exports2.default;
  }
});

// node_modules/uuid/dist/v1.js
var require_v1 = __commonJS({
  "node_modules/uuid/dist/v1.js"(exports2, module2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", {
      value: true
    });
    exports2.default = void 0;
    var _rng = _interopRequireDefault(require_rng());
    var _bytesToUuid = _interopRequireDefault(require_bytesToUuid());
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    var _nodeId;
    var _clockseq;
    var _lastMSecs = 0;
    var _lastNSecs = 0;
    function v1(options, buf, offset) {
      var i2 = buf && offset || 0;
      var b = buf || [];
      options = options || {};
      var node = options.node || _nodeId;
      var clockseq = options.clockseq !== void 0 ? options.clockseq : _clockseq;
      if (node == null || clockseq == null) {
        var seedBytes = options.random || (options.rng || _rng.default)();
        if (node == null) {
          node = _nodeId = [seedBytes[0] | 1, seedBytes[1], seedBytes[2], seedBytes[3], seedBytes[4], seedBytes[5]];
        }
        if (clockseq == null) {
          clockseq = _clockseq = (seedBytes[6] << 8 | seedBytes[7]) & 16383;
        }
      }
      var msecs = options.msecs !== void 0 ? options.msecs : (/* @__PURE__ */ new Date()).getTime();
      var nsecs = options.nsecs !== void 0 ? options.nsecs : _lastNSecs + 1;
      var dt = msecs - _lastMSecs + (nsecs - _lastNSecs) / 1e4;
      if (dt < 0 && options.clockseq === void 0) {
        clockseq = clockseq + 1 & 16383;
      }
      if ((dt < 0 || msecs > _lastMSecs) && options.nsecs === void 0) {
        nsecs = 0;
      }
      if (nsecs >= 1e4) {
        throw new Error("uuid.v1(): Can't create more than 10M uuids/sec");
      }
      _lastMSecs = msecs;
      _lastNSecs = nsecs;
      _clockseq = clockseq;
      msecs += 122192928e5;
      var tl = ((msecs & 268435455) * 1e4 + nsecs) % 4294967296;
      b[i2++] = tl >>> 24 & 255;
      b[i2++] = tl >>> 16 & 255;
      b[i2++] = tl >>> 8 & 255;
      b[i2++] = tl & 255;
      var tmh = msecs / 4294967296 * 1e4 & 268435455;
      b[i2++] = tmh >>> 8 & 255;
      b[i2++] = tmh & 255;
      b[i2++] = tmh >>> 24 & 15 | 16;
      b[i2++] = tmh >>> 16 & 255;
      b[i2++] = clockseq >>> 8 | 128;
      b[i2++] = clockseq & 255;
      for (var n = 0; n < 6; ++n) {
        b[i2 + n] = node[n];
      }
      return buf ? buf : (0, _bytesToUuid.default)(b);
    }
    var _default = v1;
    exports2.default = _default;
    module2.exports = exports2.default;
  }
});

// node_modules/uuid/dist/v35.js
var require_v35 = __commonJS({
  "node_modules/uuid/dist/v35.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", {
      value: true
    });
    exports2.default = _default;
    exports2.URL = exports2.DNS = void 0;
    var _bytesToUuid = _interopRequireDefault(require_bytesToUuid());
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    function uuidToBytes(uuid) {
      var bytes = [];
      uuid.replace(/[a-fA-F0-9]{2}/g, function(hex) {
        bytes.push(parseInt(hex, 16));
      });
      return bytes;
    }
    function stringToBytes(str) {
      str = unescape(encodeURIComponent(str));
      var bytes = new Array(str.length);
      for (var i2 = 0; i2 < str.length; i2++) {
        bytes[i2] = str.charCodeAt(i2);
      }
      return bytes;
    }
    var DNS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
    exports2.DNS = DNS;
    var URL2 = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";
    exports2.URL = URL2;
    function _default(name, version, hashfunc) {
      var generateUUID = function(value, namespace, buf, offset) {
        var off = buf && offset || 0;
        if (typeof value == "string") value = stringToBytes(value);
        if (typeof namespace == "string") namespace = uuidToBytes(namespace);
        if (!Array.isArray(value)) throw TypeError("value must be an array of bytes");
        if (!Array.isArray(namespace) || namespace.length !== 16) throw TypeError("namespace must be uuid string or an Array of 16 byte values");
        var bytes = hashfunc(namespace.concat(value));
        bytes[6] = bytes[6] & 15 | version;
        bytes[8] = bytes[8] & 63 | 128;
        if (buf) {
          for (var idx = 0; idx < 16; ++idx) {
            buf[off + idx] = bytes[idx];
          }
        }
        return buf || (0, _bytesToUuid.default)(bytes);
      };
      try {
        generateUUID.name = name;
      } catch (err) {
      }
      generateUUID.DNS = DNS;
      generateUUID.URL = URL2;
      return generateUUID;
    }
  }
});

// node_modules/uuid/dist/md5.js
var require_md5 = __commonJS({
  "node_modules/uuid/dist/md5.js"(exports2, module2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", {
      value: true
    });
    exports2.default = void 0;
    var _crypto = _interopRequireDefault(require("crypto"));
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    function md5(bytes) {
      if (Array.isArray(bytes)) {
        bytes = Buffer.from(bytes);
      } else if (typeof bytes === "string") {
        bytes = Buffer.from(bytes, "utf8");
      }
      return _crypto.default.createHash("md5").update(bytes).digest();
    }
    var _default = md5;
    exports2.default = _default;
    module2.exports = exports2.default;
  }
});

// node_modules/uuid/dist/v3.js
var require_v3 = __commonJS({
  "node_modules/uuid/dist/v3.js"(exports2, module2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", {
      value: true
    });
    exports2.default = void 0;
    var _v = _interopRequireDefault(require_v35());
    var _md = _interopRequireDefault(require_md5());
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    var v3 = (0, _v.default)("v3", 48, _md.default);
    var _default = v3;
    exports2.default = _default;
    module2.exports = exports2.default;
  }
});

// node_modules/uuid/dist/v4.js
var require_v4 = __commonJS({
  "node_modules/uuid/dist/v4.js"(exports2, module2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", {
      value: true
    });
    exports2.default = void 0;
    var _rng = _interopRequireDefault(require_rng());
    var _bytesToUuid = _interopRequireDefault(require_bytesToUuid());
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    function v4(options, buf, offset) {
      var i2 = buf && offset || 0;
      if (typeof options == "string") {
        buf = options === "binary" ? new Array(16) : null;
        options = null;
      }
      options = options || {};
      var rnds = options.random || (options.rng || _rng.default)();
      rnds[6] = rnds[6] & 15 | 64;
      rnds[8] = rnds[8] & 63 | 128;
      if (buf) {
        for (var ii = 0; ii < 16; ++ii) {
          buf[i2 + ii] = rnds[ii];
        }
      }
      return buf || (0, _bytesToUuid.default)(rnds);
    }
    var _default = v4;
    exports2.default = _default;
    module2.exports = exports2.default;
  }
});

// node_modules/uuid/dist/sha1.js
var require_sha1 = __commonJS({
  "node_modules/uuid/dist/sha1.js"(exports2, module2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", {
      value: true
    });
    exports2.default = void 0;
    var _crypto = _interopRequireDefault(require("crypto"));
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    function sha1(bytes) {
      if (Array.isArray(bytes)) {
        bytes = Buffer.from(bytes);
      } else if (typeof bytes === "string") {
        bytes = Buffer.from(bytes, "utf8");
      }
      return _crypto.default.createHash("sha1").update(bytes).digest();
    }
    var _default = sha1;
    exports2.default = _default;
    module2.exports = exports2.default;
  }
});

// node_modules/uuid/dist/v5.js
var require_v5 = __commonJS({
  "node_modules/uuid/dist/v5.js"(exports2, module2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", {
      value: true
    });
    exports2.default = void 0;
    var _v = _interopRequireDefault(require_v35());
    var _sha = _interopRequireDefault(require_sha1());
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
    var v5 = (0, _v.default)("v5", 80, _sha.default);
    var _default = v5;
    exports2.default = _default;
    module2.exports = exports2.default;
  }
});

// node_modules/uuid/dist/index.js
var require_dist = __commonJS({
  "node_modules/uuid/dist/index.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", {
      value: true
    });
    Object.defineProperty(exports2, "v1", {
      enumerable: true,
      get: function() {
        return _v.default;
      }
    });
    Object.defineProperty(exports2, "v3", {
      enumerable: true,
      get: function() {
        return _v2.default;
      }
    });
    Object.defineProperty(exports2, "v4", {
      enumerable: true,
      get: function() {
        return _v3.default;
      }
    });
    Object.defineProperty(exports2, "v5", {
      enumerable: true,
      get: function() {
        return _v4.default;
      }
    });
    var _v = _interopRequireDefault(require_v1());
    var _v2 = _interopRequireDefault(require_v3());
    var _v3 = _interopRequireDefault(require_v4());
    var _v4 = _interopRequireDefault(require_v5());
    function _interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
  }
});

// node_modules/xcode/lib/pbxWriter.js
var require_pbxWriter = __commonJS({
  "node_modules/xcode/lib/pbxWriter.js"(exports2, module2) {
    var pbxProj = require_pbxProject();
    var util = require("util");
    var f = util.format;
    var INDENT = "	";
    var COMMENT_KEY = /_comment$/;
    var EventEmitter = require("events").EventEmitter;
    function i2(x) {
      if (x <= 0)
        return "";
      else
        return INDENT + i2(x - 1);
    }
    function comment(key2, parent) {
      var text = parent[key2 + "_comment"];
      if (text)
        return text;
      else
        return null;
    }
    function isObject(obj) {
      return obj === Object(obj);
    }
    function isArray(obj) {
      return Array.isArray(obj);
    }
    function pbxWriter(contents, options) {
      if (!options) {
        options = {};
      }
      if (options.omitEmptyValues === void 0) {
        options.omitEmptyValues = false;
      }
      this.contents = contents;
      this.sync = false;
      this.indentLevel = 0;
      this.omitEmptyValues = options.omitEmptyValues;
    }
    util.inherits(pbxWriter, EventEmitter);
    pbxWriter.prototype.write = function(str) {
      var fmt = f.apply(null, arguments);
      if (this.sync) {
        this.buffer += f("%s%s", i2(this.indentLevel), fmt);
      } else {
      }
    };
    pbxWriter.prototype.writeFlush = function(str) {
      var oldIndent = this.indentLevel;
      this.indentLevel = 0;
      this.write.apply(this, arguments);
      this.indentLevel = oldIndent;
    };
    pbxWriter.prototype.writeSync = function() {
      this.sync = true;
      this.buffer = "";
      this.writeHeadComment();
      this.writeProject();
      return this.buffer;
    };
    pbxWriter.prototype.writeHeadComment = function() {
      if (this.contents.headComment) {
        this.write("// %s\n", this.contents.headComment);
      }
    };
    pbxWriter.prototype.writeProject = function() {
      var proj = this.contents.project, key2, cmt, obj;
      this.write("{\n");
      if (proj) {
        this.indentLevel++;
        for (key2 in proj) {
          if (COMMENT_KEY.test(key2)) continue;
          cmt = comment(key2, proj);
          obj = proj[key2];
          if (isArray(obj)) {
            this.writeArray(obj, key2);
          } else if (isObject(obj)) {
            this.write("%s = {\n", key2);
            this.indentLevel++;
            if (key2 === "objects") {
              this.writeObjectsSections(obj);
            } else {
              this.writeObject(obj);
            }
            this.indentLevel--;
            this.write("};\n");
          } else if (this.omitEmptyValues && (obj === void 0 || obj === null)) {
            continue;
          } else if (cmt) {
            this.write("%s = %s /* %s */;\n", key2, obj, cmt);
          } else {
            this.write("%s = %s;\n", key2, obj);
          }
        }
        this.indentLevel--;
      }
      this.write("}\n");
    };
    pbxWriter.prototype.writeObject = function(object) {
      var key2, obj, cmt;
      for (key2 in object) {
        if (COMMENT_KEY.test(key2)) continue;
        cmt = comment(key2, object);
        obj = object[key2];
        if (isArray(obj)) {
          this.writeArray(obj, key2);
        } else if (isObject(obj)) {
          this.write("%s = {\n", key2);
          this.indentLevel++;
          this.writeObject(obj);
          this.indentLevel--;
          this.write("};\n");
        } else {
          if (this.omitEmptyValues && (obj === void 0 || obj === null)) {
            continue;
          } else if (cmt) {
            this.write("%s = %s /* %s */;\n", key2, obj, cmt);
          } else {
            this.write("%s = %s;\n", key2, obj);
          }
        }
      }
    };
    pbxWriter.prototype.writeObjectsSections = function(objects) {
      var key2, obj;
      for (key2 in objects) {
        this.writeFlush("\n");
        obj = objects[key2];
        if (isObject(obj)) {
          this.writeSectionComment(key2, true);
          this.writeSection(obj);
          this.writeSectionComment(key2, false);
        }
      }
    };
    pbxWriter.prototype.writeArray = function(arr, name) {
      var i3, entry;
      this.write("%s = (\n", name);
      this.indentLevel++;
      for (i3 = 0; i3 < arr.length; i3++) {
        entry = arr[i3];
        if (entry.value && entry.comment) {
          this.write("%s /* %s */,\n", entry.value, entry.comment);
        } else if (isObject(entry)) {
          this.write("{\n");
          this.indentLevel++;
          this.writeObject(entry);
          this.indentLevel--;
          this.write("},\n");
        } else {
          this.write("%s,\n", entry);
        }
      }
      this.indentLevel--;
      this.write(");\n");
    };
    pbxWriter.prototype.writeSectionComment = function(name, begin) {
      if (begin) {
        this.writeFlush("/* Begin %s section */\n", name);
      } else {
        this.writeFlush("/* End %s section */\n", name);
      }
    };
    pbxWriter.prototype.writeSection = function(section) {
      var key2, obj, cmt;
      for (key2 in section) {
        if (COMMENT_KEY.test(key2)) continue;
        cmt = comment(key2, section);
        obj = section[key2];
        if (obj.isa == "PBXBuildFile" || obj.isa == "PBXFileReference") {
          this.writeInlineObject(key2, cmt, obj);
        } else {
          if (cmt) {
            this.write("%s /* %s */ = {\n", key2, cmt);
          } else {
            this.write("%s = {\n", key2);
          }
          this.indentLevel++;
          this.writeObject(obj);
          this.indentLevel--;
          this.write("};\n");
        }
      }
    };
    pbxWriter.prototype.writeInlineObject = function(n, d, r) {
      var output = [];
      var self = this;
      var inlineObjectHelper = function(name, desc, ref) {
        var key2, cmt, obj;
        if (desc) {
          output.push(f("%s /* %s */ = {", name, desc));
        } else {
          output.push(f("%s = {", name));
        }
        for (key2 in ref) {
          if (COMMENT_KEY.test(key2)) continue;
          cmt = comment(key2, ref);
          obj = ref[key2];
          if (isArray(obj)) {
            output.push(f("%s = (", key2));
            for (var i3 = 0; i3 < obj.length; i3++) {
              output.push(f("%s, ", obj[i3]));
            }
            output.push("); ");
          } else if (isObject(obj)) {
            inlineObjectHelper(key2, cmt, obj);
          } else if (self.omitEmptyValues && (obj === void 0 || obj === null)) {
            continue;
          } else if (cmt) {
            output.push(f("%s = %s /* %s */; ", key2, obj, cmt));
          } else {
            output.push(f("%s = %s; ", key2, obj));
          }
        }
        output.push("}; ");
      };
      inlineObjectHelper(n, d, r);
      this.write("%s\n", output.join("").trim());
    };
    module2.exports = pbxWriter;
  }
});

// node_modules/xcode/lib/pbxFile.js
var require_pbxFile = __commonJS({
  "node_modules/xcode/lib/pbxFile.js"(exports2, module2) {
    var path2 = require("path");
    var util = require("util");
    var DEFAULT_SOURCETREE = '"<group>"';
    var DEFAULT_PRODUCT_SOURCETREE = "BUILT_PRODUCTS_DIR";
    var DEFAULT_GROUP = "Resources";
    var DEFAULT_FILETYPE = "unknown";
    var FILETYPE_BY_EXTENSION = {
      a: "archive.ar",
      app: "wrapper.application",
      appex: "wrapper.app-extension",
      bundle: "wrapper.plug-in",
      dylib: "compiled.mach-o.dylib",
      framework: "wrapper.framework",
      h: "sourcecode.c.h",
      m: "sourcecode.c.objc",
      markdown: "text",
      mdimporter: "wrapper.cfbundle",
      octest: "wrapper.cfbundle",
      pch: "sourcecode.c.h",
      plist: "text.plist.xml",
      sh: "text.script.sh",
      swift: "sourcecode.swift",
      tbd: "sourcecode.text-based-dylib-definition",
      xcassets: "folder.assetcatalog",
      xcconfig: "text.xcconfig",
      xcdatamodel: "wrapper.xcdatamodel",
      xcodeproj: "wrapper.pb-project",
      xctest: "wrapper.cfbundle",
      xib: "file.xib",
      strings: "text.plist.strings"
    };
    var GROUP_BY_FILETYPE = {
      "archive.ar": "Frameworks",
      "compiled.mach-o.dylib": "Frameworks",
      "sourcecode.text-based-dylib-definition": "Frameworks",
      "wrapper.framework": "Frameworks",
      "embedded.framework": "Embed Frameworks",
      "sourcecode.c.h": "Resources",
      "sourcecode.c.objc": "Sources",
      "sourcecode.swift": "Sources"
    };
    var PATH_BY_FILETYPE = {
      "compiled.mach-o.dylib": "usr/lib/",
      "sourcecode.text-based-dylib-definition": "usr/lib/",
      "wrapper.framework": "System/Library/Frameworks/"
    };
    var SOURCETREE_BY_FILETYPE = {
      "compiled.mach-o.dylib": "SDKROOT",
      "sourcecode.text-based-dylib-definition": "SDKROOT",
      "wrapper.framework": "SDKROOT"
    };
    var ENCODING_BY_FILETYPE = {
      "sourcecode.c.h": 4,
      "sourcecode.c.h": 4,
      "sourcecode.c.objc": 4,
      "sourcecode.swift": 4,
      "text": 4,
      "text.plist.xml": 4,
      "text.script.sh": 4,
      "text.xcconfig": 4,
      "text.plist.strings": 4
    };
    function unquoted(text) {
      return text == null ? "" : text.replace(/(^")|("$)/g, "");
    }
    function detectType(filePath) {
      var extension = path2.extname(filePath).substring(1), filetype = FILETYPE_BY_EXTENSION[unquoted(extension)];
      if (!filetype) {
        return DEFAULT_FILETYPE;
      }
      return filetype;
    }
    function defaultExtension(fileRef) {
      var filetype = fileRef.lastKnownFileType && fileRef.lastKnownFileType != DEFAULT_FILETYPE ? fileRef.lastKnownFileType : fileRef.explicitFileType;
      for (var extension in FILETYPE_BY_EXTENSION) {
        if (FILETYPE_BY_EXTENSION.hasOwnProperty(unquoted(extension))) {
          if (FILETYPE_BY_EXTENSION[unquoted(extension)] === unquoted(filetype))
            return extension;
        }
      }
    }
    function defaultEncoding(fileRef) {
      var filetype = fileRef.lastKnownFileType || fileRef.explicitFileType, encoding = ENCODING_BY_FILETYPE[unquoted(filetype)];
      if (encoding) {
        return encoding;
      }
    }
    function detectGroup(fileRef, opt) {
      var extension = path2.extname(fileRef.basename).substring(1), filetype = fileRef.lastKnownFileType || fileRef.explicitFileType, groupName = GROUP_BY_FILETYPE[unquoted(filetype)];
      if (extension === "xcdatamodeld") {
        return "Sources";
      }
      if (opt.customFramework && opt.embed) {
        return GROUP_BY_FILETYPE["embedded.framework"];
      }
      if (!groupName) {
        return DEFAULT_GROUP;
      }
      return groupName;
    }
    function detectSourcetree(fileRef) {
      var filetype = fileRef.lastKnownFileType || fileRef.explicitFileType, sourcetree = SOURCETREE_BY_FILETYPE[unquoted(filetype)];
      if (fileRef.explicitFileType) {
        return DEFAULT_PRODUCT_SOURCETREE;
      }
      if (fileRef.customFramework) {
        return DEFAULT_SOURCETREE;
      }
      if (!sourcetree) {
        return DEFAULT_SOURCETREE;
      }
      return sourcetree;
    }
    function defaultPath(fileRef, filePath) {
      var filetype = fileRef.lastKnownFileType || fileRef.explicitFileType, defaultPath2 = PATH_BY_FILETYPE[unquoted(filetype)];
      if (fileRef.customFramework) {
        return filePath;
      }
      if (defaultPath2) {
        return path2.join(defaultPath2, path2.basename(filePath));
      }
      return filePath;
    }
    function pbxFile(filepath, opt) {
      var opt = opt || {};
      this.basename = path2.basename(filepath);
      this.lastKnownFileType = opt.lastKnownFileType || detectType(filepath);
      this.group = detectGroup(this, opt);
      if (opt.customFramework == true) {
        this.customFramework = true;
        this.dirname = path2.dirname(filepath).replace(/\\/g, "/");
      }
      this.path = defaultPath(this, filepath).replace(/\\/g, "/");
      this.fileEncoding = this.defaultEncoding = opt.defaultEncoding || defaultEncoding(this);
      if (opt.explicitFileType) {
        this.explicitFileType = opt.explicitFileType;
        this.basename = this.basename + "." + defaultExtension(this);
        delete this.path;
        delete this.lastKnownFileType;
        delete this.group;
        delete this.defaultEncoding;
      }
      this.sourceTree = opt.sourceTree || detectSourcetree(this);
      this.includeInIndex = 0;
      if (opt.weak && opt.weak === true)
        this.settings = { ATTRIBUTES: ["Weak"] };
      if (opt.compilerFlags) {
        if (!this.settings)
          this.settings = {};
        this.settings.COMPILER_FLAGS = util.format('"%s"', opt.compilerFlags);
      }
      if (opt.embed && opt.sign) {
        if (!this.settings)
          this.settings = {};
        if (!this.settings.ATTRIBUTES)
          this.settings.ATTRIBUTES = [];
        this.settings.ATTRIBUTES.push("CodeSignOnCopy");
      }
    }
    module2.exports = pbxFile;
  }
});

// node_modules/xcode/lib/parser/pbxproj.js
var require_pbxproj = __commonJS({
  "node_modules/xcode/lib/parser/pbxproj.js"(exports2, module2) {
    "use strict";
    function peg$subclass(child, parent) {
      function ctor() {
        this.constructor = child;
      }
      ctor.prototype = parent.prototype;
      child.prototype = new ctor();
    }
    function peg$SyntaxError(message, expected, found, location) {
      this.message = message;
      this.expected = expected;
      this.found = found;
      this.location = location;
      this.name = "SyntaxError";
      if (typeof Error.captureStackTrace === "function") {
        Error.captureStackTrace(this, peg$SyntaxError);
      }
    }
    peg$subclass(peg$SyntaxError, Error);
    peg$SyntaxError.buildMessage = function(expected, found) {
      var DESCRIBE_EXPECTATION_FNS = {
        literal: function(expectation) {
          return '"' + literalEscape(expectation.text) + '"';
        },
        "class": function(expectation) {
          var escapedParts = "", i2;
          for (i2 = 0; i2 < expectation.parts.length; i2++) {
            escapedParts += expectation.parts[i2] instanceof Array ? classEscape(expectation.parts[i2][0]) + "-" + classEscape(expectation.parts[i2][1]) : classEscape(expectation.parts[i2]);
          }
          return "[" + (expectation.inverted ? "^" : "") + escapedParts + "]";
        },
        any: function(expectation) {
          return "any character";
        },
        end: function(expectation) {
          return "end of input";
        },
        other: function(expectation) {
          return expectation.description;
        }
      };
      function hex(ch) {
        return ch.charCodeAt(0).toString(16).toUpperCase();
      }
      function literalEscape(s) {
        return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\0/g, "\\0").replace(/\t/g, "\\t").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/[\x00-\x0F]/g, function(ch) {
          return "\\x0" + hex(ch);
        }).replace(/[\x10-\x1F\x7F-\x9F]/g, function(ch) {
          return "\\x" + hex(ch);
        });
      }
      function classEscape(s) {
        return s.replace(/\\/g, "\\\\").replace(/\]/g, "\\]").replace(/\^/g, "\\^").replace(/-/g, "\\-").replace(/\0/g, "\\0").replace(/\t/g, "\\t").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/[\x00-\x0F]/g, function(ch) {
          return "\\x0" + hex(ch);
        }).replace(/[\x10-\x1F\x7F-\x9F]/g, function(ch) {
          return "\\x" + hex(ch);
        });
      }
      function describeExpectation(expectation) {
        return DESCRIBE_EXPECTATION_FNS[expectation.type](expectation);
      }
      function describeExpected(expected2) {
        var descriptions = new Array(expected2.length), i2, j;
        for (i2 = 0; i2 < expected2.length; i2++) {
          descriptions[i2] = describeExpectation(expected2[i2]);
        }
        descriptions.sort();
        if (descriptions.length > 0) {
          for (i2 = 1, j = 1; i2 < descriptions.length; i2++) {
            if (descriptions[i2 - 1] !== descriptions[i2]) {
              descriptions[j] = descriptions[i2];
              j++;
            }
          }
          descriptions.length = j;
        }
        switch (descriptions.length) {
          case 1:
            return descriptions[0];
          case 2:
            return descriptions[0] + " or " + descriptions[1];
          default:
            return descriptions.slice(0, -1).join(", ") + ", or " + descriptions[descriptions.length - 1];
        }
      }
      function describeFound(found2) {
        return found2 ? '"' + literalEscape(found2) + '"' : "end of input";
      }
      return "Expected " + describeExpected(expected) + " but " + describeFound(found) + " found.";
    };
    function peg$parse(input, options) {
      options = options !== void 0 ? options : {};
      var peg$FAILED = {}, peg$startRuleFunctions = { Project: peg$parseProject }, peg$startRuleFunction = peg$parseProject, peg$c0 = function(headComment, obj) {
        var proj = /* @__PURE__ */ Object.create(null);
        proj.project = obj;
        if (headComment) {
          proj.headComment = headComment;
        }
        return proj;
      }, peg$c1 = "{", peg$c2 = peg$literalExpectation("{", false), peg$c3 = "}", peg$c4 = peg$literalExpectation("}", false), peg$c5 = function(obj) {
        return obj;
      }, peg$c6 = function() {
        return /* @__PURE__ */ Object.create(null);
      }, peg$c7 = function(list) {
        var returnObject = list[0][0];
        for (var i2 = 1; i2 < list.length; i2++) {
          var another = list[i2][0];
          returnObject = Object.assign(returnObject, another);
        }
        return returnObject;
      }, peg$c8 = "=", peg$c9 = peg$literalExpectation("=", false), peg$c10 = ";", peg$c11 = peg$literalExpectation(";", false), peg$c12 = function(id, val) {
        var result = /* @__PURE__ */ Object.create(null);
        result[id] = val;
        return result;
      }, peg$c13 = function(commentedId, val) {
        var result = /* @__PURE__ */ Object.create(null), commentKey = commentedId.id + "_comment";
        result[commentedId.id] = val;
        result[commentKey] = commentedId[commentKey];
        return result;
      }, peg$c14 = function(id, commentedVal) {
        var result = /* @__PURE__ */ Object.create(null);
        result[id] = commentedVal.value;
        result[id + "_comment"] = commentedVal.comment;
        return result;
      }, peg$c15 = function(id, comment) {
        var result = /* @__PURE__ */ Object.create(null);
        result.id = id;
        result[id + "_comment"] = comment.trim();
        return result;
      }, peg$c16 = function(literal, comment) {
        var result = /* @__PURE__ */ Object.create(null);
        result.comment = comment.trim();
        result.value = literal.trim();
        return result;
      }, peg$c17 = /^[^*]/, peg$c18 = peg$classExpectation(["*"], true, false), peg$c19 = function(body) {
        return body.join("");
      }, peg$c20 = "/*", peg$c21 = peg$literalExpectation("/*", false), peg$c22 = "*/", peg$c23 = peg$literalExpectation("*/", false), peg$c24 = function(begin, fields) {
        var section = /* @__PURE__ */ Object.create(null);
        section[begin.name] = fields;
        return section;
      }, peg$c25 = "/* Begin ", peg$c26 = peg$literalExpectation("/* Begin ", false), peg$c27 = " section */", peg$c28 = peg$literalExpectation(" section */", false), peg$c29 = function(sectionName) {
        return { name: sectionName };
      }, peg$c30 = "/* End ", peg$c31 = peg$literalExpectation("/* End ", false), peg$c32 = "(", peg$c33 = peg$literalExpectation("(", false), peg$c34 = ")", peg$c35 = peg$literalExpectation(")", false), peg$c36 = function(arr) {
        return arr;
      }, peg$c37 = function() {
        return [];
      }, peg$c38 = function(head, tail) {
        if (tail) {
          tail.unshift(head);
          return tail;
        } else {
          return [head];
        }
      }, peg$c39 = function(val) {
        return val;
      }, peg$c40 = function(val, comment) {
        var result = /* @__PURE__ */ Object.create(null);
        result.value = val.trim();
        result.comment = comment.trim();
        return result;
      }, peg$c41 = ",", peg$c42 = peg$literalExpectation(",", false), peg$c43 = /^[A-Za-z0-9_.]/, peg$c44 = peg$classExpectation([["A", "Z"], ["a", "z"], ["0", "9"], "_", "."], false, false), peg$c45 = function(id) {
        return id.join("");
      }, peg$c46 = ".", peg$c47 = peg$literalExpectation(".", false), peg$c48 = function(decimal) {
        return decimal.join("");
      }, peg$c49 = function(number) {
        return parseInt(number.join(""), 10);
      }, peg$c50 = function(str) {
        return '"' + str + '"';
      }, peg$c51 = function(str) {
        return str.join("");
      }, peg$c52 = peg$anyExpectation(), peg$c53 = function(char) {
        return char;
      }, peg$c54 = "\\", peg$c55 = peg$literalExpectation("\\", false), peg$c56 = function() {
        return '\\"';
      }, peg$c57 = function(literal) {
        return literal.join("");
      }, peg$c58 = /^[^;,\n]/, peg$c59 = peg$classExpectation([";", ",", "\n"], true, false), peg$c60 = "//", peg$c61 = peg$literalExpectation("//", false), peg$c62 = function(contents) {
        return contents;
      }, peg$c63 = function(contents) {
        return contents.join("");
      }, peg$c64 = /^[0-9]/, peg$c65 = peg$classExpectation([["0", "9"]], false, false), peg$c66 = /^[A-Za-z]/, peg$c67 = peg$classExpectation([["A", "Z"], ["a", "z"]], false, false), peg$c68 = '"', peg$c69 = peg$literalExpectation('"', false), peg$c70 = peg$otherExpectation("whitespace"), peg$c71 = /^[\t ]/, peg$c72 = peg$classExpectation(["	", " "], false, false), peg$c73 = /^[\n\r]/, peg$c74 = peg$classExpectation(["\n", "\r"], false, false), peg$currPos = 0, peg$savedPos = 0, peg$posDetailsCache = [{ line: 1, column: 1 }], peg$maxFailPos = 0, peg$maxFailExpected = [], peg$silentFails = 0, peg$result;
      if ("startRule" in options) {
        if (!(options.startRule in peg$startRuleFunctions)) {
          throw new Error(`Can't start parsing from rule "` + options.startRule + '".');
        }
        peg$startRuleFunction = peg$startRuleFunctions[options.startRule];
      }
      function text() {
        return input.substring(peg$savedPos, peg$currPos);
      }
      function location() {
        return peg$computeLocation(peg$savedPos, peg$currPos);
      }
      function expected(description, location2) {
        location2 = location2 !== void 0 ? location2 : peg$computeLocation(peg$savedPos, peg$currPos);
        throw peg$buildStructuredError(
          [peg$otherExpectation(description)],
          input.substring(peg$savedPos, peg$currPos),
          location2
        );
      }
      function error(message, location2) {
        location2 = location2 !== void 0 ? location2 : peg$computeLocation(peg$savedPos, peg$currPos);
        throw peg$buildSimpleError(message, location2);
      }
      function peg$literalExpectation(text2, ignoreCase) {
        return { type: "literal", text: text2, ignoreCase };
      }
      function peg$classExpectation(parts, inverted, ignoreCase) {
        return { type: "class", parts, inverted, ignoreCase };
      }
      function peg$anyExpectation() {
        return { type: "any" };
      }
      function peg$endExpectation() {
        return { type: "end" };
      }
      function peg$otherExpectation(description) {
        return { type: "other", description };
      }
      function peg$computePosDetails(pos) {
        var details = peg$posDetailsCache[pos], p;
        if (details) {
          return details;
        } else {
          p = pos - 1;
          while (!peg$posDetailsCache[p]) {
            p--;
          }
          details = peg$posDetailsCache[p];
          details = {
            line: details.line,
            column: details.column
          };
          while (p < pos) {
            if (input.charCodeAt(p) === 10) {
              details.line++;
              details.column = 1;
            } else {
              details.column++;
            }
            p++;
          }
          peg$posDetailsCache[pos] = details;
          return details;
        }
      }
      function peg$computeLocation(startPos, endPos) {
        var startPosDetails = peg$computePosDetails(startPos), endPosDetails = peg$computePosDetails(endPos);
        return {
          start: {
            offset: startPos,
            line: startPosDetails.line,
            column: startPosDetails.column
          },
          end: {
            offset: endPos,
            line: endPosDetails.line,
            column: endPosDetails.column
          }
        };
      }
      function peg$fail(expected2) {
        if (peg$currPos < peg$maxFailPos) {
          return;
        }
        if (peg$currPos > peg$maxFailPos) {
          peg$maxFailPos = peg$currPos;
          peg$maxFailExpected = [];
        }
        peg$maxFailExpected.push(expected2);
      }
      function peg$buildSimpleError(message, location2) {
        return new peg$SyntaxError(message, null, null, location2);
      }
      function peg$buildStructuredError(expected2, found, location2) {
        return new peg$SyntaxError(
          peg$SyntaxError.buildMessage(expected2, found),
          expected2,
          found,
          location2
        );
      }
      function peg$parseProject() {
        var s0, s1, s2, s3, s4, s5, s6;
        s0 = peg$currPos;
        s1 = peg$parseSingleLineComment();
        if (s1 === peg$FAILED) {
          s1 = null;
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parseInlineComment();
          if (s2 === peg$FAILED) {
            s2 = null;
          }
          if (s2 !== peg$FAILED) {
            s3 = peg$parse_();
            if (s3 !== peg$FAILED) {
              s4 = peg$parseObject();
              if (s4 !== peg$FAILED) {
                s5 = peg$parseNewLine();
                if (s5 !== peg$FAILED) {
                  s6 = peg$parse_();
                  if (s6 !== peg$FAILED) {
                    peg$savedPos = s0;
                    s1 = peg$c0(s1, s4);
                    s0 = s1;
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      function peg$parseObject() {
        var s0, s1, s2, s3;
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 123) {
          s1 = peg$c1;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$c2);
          }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parseAssignmentList();
          if (s2 === peg$FAILED) {
            s2 = peg$parseEmptyBody();
          }
          if (s2 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 125) {
              s3 = peg$c3;
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$c4);
              }
            }
            if (s3 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c5(s2);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      function peg$parseEmptyBody() {
        var s0, s1;
        s0 = peg$currPos;
        s1 = peg$parse_();
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c6();
        }
        s0 = s1;
        return s0;
      }
      function peg$parseAssignmentList() {
        var s0, s1, s2, s3, s4, s5;
        s0 = peg$currPos;
        s1 = peg$parse_();
        if (s1 !== peg$FAILED) {
          s2 = [];
          s3 = peg$currPos;
          s4 = peg$parseAssignment();
          if (s4 === peg$FAILED) {
            s4 = peg$parseDelimitedSection();
          }
          if (s4 !== peg$FAILED) {
            s5 = peg$parse_();
            if (s5 !== peg$FAILED) {
              s4 = [s4, s5];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$FAILED;
          }
          if (s3 !== peg$FAILED) {
            while (s3 !== peg$FAILED) {
              s2.push(s3);
              s3 = peg$currPos;
              s4 = peg$parseAssignment();
              if (s4 === peg$FAILED) {
                s4 = peg$parseDelimitedSection();
              }
              if (s4 !== peg$FAILED) {
                s5 = peg$parse_();
                if (s5 !== peg$FAILED) {
                  s4 = [s4, s5];
                  s3 = s4;
                } else {
                  peg$currPos = s3;
                  s3 = peg$FAILED;
                }
              } else {
                peg$currPos = s3;
                s3 = peg$FAILED;
              }
            }
          } else {
            s2 = peg$FAILED;
          }
          if (s2 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c7(s2);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      function peg$parseAssignment() {
        var s0;
        s0 = peg$parseSimpleAssignment();
        if (s0 === peg$FAILED) {
          s0 = peg$parseCommentedAssignment();
        }
        return s0;
      }
      function peg$parseSimpleAssignment() {
        var s0, s1, s2, s3, s4, s5, s6;
        s0 = peg$currPos;
        s1 = peg$parseIdentifier();
        if (s1 !== peg$FAILED) {
          s2 = peg$parse_();
          if (s2 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 61) {
              s3 = peg$c8;
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$c9);
              }
            }
            if (s3 !== peg$FAILED) {
              s4 = peg$parse_();
              if (s4 !== peg$FAILED) {
                s5 = peg$parseValue();
                if (s5 !== peg$FAILED) {
                  if (input.charCodeAt(peg$currPos) === 59) {
                    s6 = peg$c10;
                    peg$currPos++;
                  } else {
                    s6 = peg$FAILED;
                    if (peg$silentFails === 0) {
                      peg$fail(peg$c11);
                    }
                  }
                  if (s6 !== peg$FAILED) {
                    peg$savedPos = s0;
                    s1 = peg$c12(s1, s5);
                    s0 = s1;
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      function peg$parseCommentedAssignment() {
        var s0, s1, s2, s3, s4, s5, s6;
        s0 = peg$currPos;
        s1 = peg$parseCommentedIdentifier();
        if (s1 !== peg$FAILED) {
          s2 = peg$parse_();
          if (s2 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 61) {
              s3 = peg$c8;
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$c9);
              }
            }
            if (s3 !== peg$FAILED) {
              s4 = peg$parse_();
              if (s4 !== peg$FAILED) {
                s5 = peg$parseValue();
                if (s5 !== peg$FAILED) {
                  if (input.charCodeAt(peg$currPos) === 59) {
                    s6 = peg$c10;
                    peg$currPos++;
                  } else {
                    s6 = peg$FAILED;
                    if (peg$silentFails === 0) {
                      peg$fail(peg$c11);
                    }
                  }
                  if (s6 !== peg$FAILED) {
                    peg$savedPos = s0;
                    s1 = peg$c13(s1, s5);
                    s0 = s1;
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          s1 = peg$parseIdentifier();
          if (s1 !== peg$FAILED) {
            s2 = peg$parse_();
            if (s2 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 61) {
                s3 = peg$c8;
                peg$currPos++;
              } else {
                s3 = peg$FAILED;
                if (peg$silentFails === 0) {
                  peg$fail(peg$c9);
                }
              }
              if (s3 !== peg$FAILED) {
                s4 = peg$parse_();
                if (s4 !== peg$FAILED) {
                  s5 = peg$parseCommentedValue();
                  if (s5 !== peg$FAILED) {
                    if (input.charCodeAt(peg$currPos) === 59) {
                      s6 = peg$c10;
                      peg$currPos++;
                    } else {
                      s6 = peg$FAILED;
                      if (peg$silentFails === 0) {
                        peg$fail(peg$c11);
                      }
                    }
                    if (s6 !== peg$FAILED) {
                      peg$savedPos = s0;
                      s1 = peg$c14(s1, s5);
                      s0 = s1;
                    } else {
                      peg$currPos = s0;
                      s0 = peg$FAILED;
                    }
                  } else {
                    peg$currPos = s0;
                    s0 = peg$FAILED;
                  }
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        }
        return s0;
      }
      function peg$parseCommentedIdentifier() {
        var s0, s1, s2, s3;
        s0 = peg$currPos;
        s1 = peg$parseIdentifier();
        if (s1 !== peg$FAILED) {
          s2 = peg$parse_();
          if (s2 !== peg$FAILED) {
            s3 = peg$parseInlineComment();
            if (s3 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c15(s1, s3);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      function peg$parseCommentedValue() {
        var s0, s1, s2, s3;
        s0 = peg$currPos;
        s1 = peg$parseValue();
        if (s1 !== peg$FAILED) {
          s2 = peg$parse_();
          if (s2 !== peg$FAILED) {
            s3 = peg$parseInlineComment();
            if (s3 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c16(s1, s3);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      function peg$parseInlineComment() {
        var s0, s1, s2, s3;
        s0 = peg$currPos;
        s1 = peg$parseInlineCommentOpen();
        if (s1 !== peg$FAILED) {
          s2 = [];
          if (peg$c17.test(input.charAt(peg$currPos))) {
            s3 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$c18);
            }
          }
          if (s3 !== peg$FAILED) {
            while (s3 !== peg$FAILED) {
              s2.push(s3);
              if (peg$c17.test(input.charAt(peg$currPos))) {
                s3 = input.charAt(peg$currPos);
                peg$currPos++;
              } else {
                s3 = peg$FAILED;
                if (peg$silentFails === 0) {
                  peg$fail(peg$c18);
                }
              }
            }
          } else {
            s2 = peg$FAILED;
          }
          if (s2 !== peg$FAILED) {
            s3 = peg$parseInlineCommentClose();
            if (s3 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c19(s2);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      function peg$parseInlineCommentOpen() {
        var s0;
        if (input.substr(peg$currPos, 2) === peg$c20) {
          s0 = peg$c20;
          peg$currPos += 2;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$c21);
          }
        }
        return s0;
      }
      function peg$parseInlineCommentClose() {
        var s0;
        if (input.substr(peg$currPos, 2) === peg$c22) {
          s0 = peg$c22;
          peg$currPos += 2;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$c23);
          }
        }
        return s0;
      }
      function peg$parseDelimitedSection() {
        var s0, s1, s2, s3, s4, s5;
        s0 = peg$currPos;
        s1 = peg$parseDelimitedSectionBegin();
        if (s1 !== peg$FAILED) {
          s2 = peg$parse_();
          if (s2 !== peg$FAILED) {
            s3 = peg$parseAssignmentList();
            if (s3 === peg$FAILED) {
              s3 = peg$parseEmptyBody();
            }
            if (s3 !== peg$FAILED) {
              s4 = peg$parse_();
              if (s4 !== peg$FAILED) {
                s5 = peg$parseDelimitedSectionEnd();
                if (s5 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c24(s1, s3);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      function peg$parseDelimitedSectionBegin() {
        var s0, s1, s2, s3, s4;
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 9) === peg$c25) {
          s1 = peg$c25;
          peg$currPos += 9;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$c26);
          }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parseIdentifier();
          if (s2 !== peg$FAILED) {
            if (input.substr(peg$currPos, 11) === peg$c27) {
              s3 = peg$c27;
              peg$currPos += 11;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$c28);
              }
            }
            if (s3 !== peg$FAILED) {
              s4 = peg$parseNewLine();
              if (s4 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c29(s2);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      function peg$parseDelimitedSectionEnd() {
        var s0, s1, s2, s3, s4;
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 7) === peg$c30) {
          s1 = peg$c30;
          peg$currPos += 7;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$c31);
          }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parseIdentifier();
          if (s2 !== peg$FAILED) {
            if (input.substr(peg$currPos, 11) === peg$c27) {
              s3 = peg$c27;
              peg$currPos += 11;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$c28);
              }
            }
            if (s3 !== peg$FAILED) {
              s4 = peg$parseNewLine();
              if (s4 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c29(s2);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      function peg$parseArray() {
        var s0, s1, s2, s3;
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 40) {
          s1 = peg$c32;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$c33);
          }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parseArrayBody();
          if (s2 === peg$FAILED) {
            s2 = peg$parseEmptyArray();
          }
          if (s2 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 41) {
              s3 = peg$c34;
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$c35);
              }
            }
            if (s3 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c36(s2);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      function peg$parseEmptyArray() {
        var s0, s1;
        s0 = peg$currPos;
        s1 = peg$parse_();
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c37();
        }
        s0 = s1;
        return s0;
      }
      function peg$parseArrayBody() {
        var s0, s1, s2, s3, s4, s5;
        s0 = peg$currPos;
        s1 = peg$parse_();
        if (s1 !== peg$FAILED) {
          s2 = peg$parseArrayEntry();
          if (s2 !== peg$FAILED) {
            s3 = peg$parse_();
            if (s3 !== peg$FAILED) {
              s4 = peg$parseArrayBody();
              if (s4 === peg$FAILED) {
                s4 = null;
              }
              if (s4 !== peg$FAILED) {
                s5 = peg$parse_();
                if (s5 !== peg$FAILED) {
                  peg$savedPos = s0;
                  s1 = peg$c38(s2, s4);
                  s0 = s1;
                } else {
                  peg$currPos = s0;
                  s0 = peg$FAILED;
                }
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      function peg$parseArrayEntry() {
        var s0;
        s0 = peg$parseSimpleArrayEntry();
        if (s0 === peg$FAILED) {
          s0 = peg$parseCommentedArrayEntry();
        }
        return s0;
      }
      function peg$parseSimpleArrayEntry() {
        var s0, s1, s2;
        s0 = peg$currPos;
        s1 = peg$parseValue();
        if (s1 !== peg$FAILED) {
          s2 = peg$parseEndArrayEntry();
          if (s2 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c39(s1);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      function peg$parseCommentedArrayEntry() {
        var s0, s1, s2, s3, s4;
        s0 = peg$currPos;
        s1 = peg$parseValue();
        if (s1 !== peg$FAILED) {
          s2 = peg$parse_();
          if (s2 !== peg$FAILED) {
            s3 = peg$parseInlineComment();
            if (s3 !== peg$FAILED) {
              s4 = peg$parseEndArrayEntry();
              if (s4 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c40(s1, s3);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      function peg$parseEndArrayEntry() {
        var s0, s1, s2, s3;
        if (input.charCodeAt(peg$currPos) === 44) {
          s0 = peg$c41;
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$c42);
          }
        }
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          s1 = peg$parse_();
          if (s1 !== peg$FAILED) {
            s2 = peg$currPos;
            peg$silentFails++;
            if (input.charCodeAt(peg$currPos) === 41) {
              s3 = peg$c34;
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$c35);
              }
            }
            peg$silentFails--;
            if (s3 !== peg$FAILED) {
              peg$currPos = s2;
              s2 = void 0;
            } else {
              s2 = peg$FAILED;
            }
            if (s2 !== peg$FAILED) {
              s1 = [s1, s2];
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        }
        return s0;
      }
      function peg$parseIdentifier() {
        var s0, s1, s2;
        s0 = peg$currPos;
        s1 = [];
        if (peg$c43.test(input.charAt(peg$currPos))) {
          s2 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$c44);
          }
        }
        if (s2 !== peg$FAILED) {
          while (s2 !== peg$FAILED) {
            s1.push(s2);
            if (peg$c43.test(input.charAt(peg$currPos))) {
              s2 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s2 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$c44);
              }
            }
          }
        } else {
          s1 = peg$FAILED;
        }
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c45(s1);
        }
        s0 = s1;
        if (s0 === peg$FAILED) {
          s0 = peg$parseQuotedString();
        }
        return s0;
      }
      function peg$parseValue() {
        var s0;
        s0 = peg$parseObject();
        if (s0 === peg$FAILED) {
          s0 = peg$parseArray();
          if (s0 === peg$FAILED) {
            s0 = peg$parseNumberValue();
            if (s0 === peg$FAILED) {
              s0 = peg$parseStringValue();
            }
          }
        }
        return s0;
      }
      function peg$parseNumberValue() {
        var s0;
        s0 = peg$parseDecimalValue();
        if (s0 === peg$FAILED) {
          s0 = peg$parseIntegerValue();
        }
        return s0;
      }
      function peg$parseDecimalValue() {
        var s0, s1, s2, s3, s4;
        s0 = peg$currPos;
        s1 = peg$currPos;
        s2 = peg$parseIntegerValue();
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 46) {
            s3 = peg$c46;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$c47);
            }
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parseIntegerValue();
            if (s4 !== peg$FAILED) {
              s2 = [s2, s3, s4];
              s1 = s2;
            } else {
              peg$currPos = s1;
              s1 = peg$FAILED;
            }
          } else {
            peg$currPos = s1;
            s1 = peg$FAILED;
          }
        } else {
          peg$currPos = s1;
          s1 = peg$FAILED;
        }
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c48(s1);
        }
        s0 = s1;
        return s0;
      }
      function peg$parseIntegerValue() {
        var s0, s1, s2, s3, s4;
        s0 = peg$currPos;
        s1 = peg$currPos;
        peg$silentFails++;
        s2 = peg$parseAlpha();
        peg$silentFails--;
        if (s2 === peg$FAILED) {
          s1 = void 0;
        } else {
          peg$currPos = s1;
          s1 = peg$FAILED;
        }
        if (s1 !== peg$FAILED) {
          s2 = [];
          s3 = peg$parseDigit();
          if (s3 !== peg$FAILED) {
            while (s3 !== peg$FAILED) {
              s2.push(s3);
              s3 = peg$parseDigit();
            }
          } else {
            s2 = peg$FAILED;
          }
          if (s2 !== peg$FAILED) {
            s3 = peg$currPos;
            peg$silentFails++;
            s4 = peg$parseNonTerminator();
            peg$silentFails--;
            if (s4 === peg$FAILED) {
              s3 = void 0;
            } else {
              peg$currPos = s3;
              s3 = peg$FAILED;
            }
            if (s3 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c49(s2);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      function peg$parseStringValue() {
        var s0;
        s0 = peg$parseQuotedString();
        if (s0 === peg$FAILED) {
          s0 = peg$parseLiteralString();
        }
        return s0;
      }
      function peg$parseQuotedString() {
        var s0, s1, s2, s3;
        s0 = peg$currPos;
        s1 = peg$parseDoubleQuote();
        if (s1 !== peg$FAILED) {
          s2 = peg$parseQuotedBody();
          if (s2 !== peg$FAILED) {
            s3 = peg$parseDoubleQuote();
            if (s3 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c50(s2);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      function peg$parseQuotedBody() {
        var s0, s1, s2;
        s0 = peg$currPos;
        s1 = [];
        s2 = peg$parseNonQuote();
        if (s2 !== peg$FAILED) {
          while (s2 !== peg$FAILED) {
            s1.push(s2);
            s2 = peg$parseNonQuote();
          }
        } else {
          s1 = peg$FAILED;
        }
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c51(s1);
        }
        s0 = s1;
        return s0;
      }
      function peg$parseNonQuote() {
        var s0, s1, s2;
        s0 = peg$parseEscapedQuote();
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          s1 = peg$currPos;
          peg$silentFails++;
          s2 = peg$parseDoubleQuote();
          peg$silentFails--;
          if (s2 === peg$FAILED) {
            s1 = void 0;
          } else {
            peg$currPos = s1;
            s1 = peg$FAILED;
          }
          if (s1 !== peg$FAILED) {
            if (input.length > peg$currPos) {
              s2 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s2 = peg$FAILED;
              if (peg$silentFails === 0) {
                peg$fail(peg$c52);
              }
            }
            if (s2 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c53(s2);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        }
        return s0;
      }
      function peg$parseEscapedQuote() {
        var s0, s1, s2;
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 92) {
          s1 = peg$c54;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$c55);
          }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parseDoubleQuote();
          if (s2 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c56();
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      function peg$parseLiteralString() {
        var s0, s1, s2;
        s0 = peg$currPos;
        s1 = [];
        s2 = peg$parseLiteralChar();
        if (s2 !== peg$FAILED) {
          while (s2 !== peg$FAILED) {
            s1.push(s2);
            s2 = peg$parseLiteralChar();
          }
        } else {
          s1 = peg$FAILED;
        }
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c57(s1);
        }
        s0 = s1;
        return s0;
      }
      function peg$parseLiteralChar() {
        var s0, s1, s2, s3;
        s0 = peg$currPos;
        s1 = peg$currPos;
        peg$silentFails++;
        s2 = peg$parseInlineCommentOpen();
        peg$silentFails--;
        if (s2 === peg$FAILED) {
          s1 = void 0;
        } else {
          peg$currPos = s1;
          s1 = peg$FAILED;
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$currPos;
          peg$silentFails++;
          s3 = peg$parseLineTerminator();
          peg$silentFails--;
          if (s3 === peg$FAILED) {
            s2 = void 0;
          } else {
            peg$currPos = s2;
            s2 = peg$FAILED;
          }
          if (s2 !== peg$FAILED) {
            s3 = peg$parseNonTerminator();
            if (s3 !== peg$FAILED) {
              peg$savedPos = s0;
              s1 = peg$c53(s3);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      function peg$parseNonTerminator() {
        var s0;
        if (peg$c58.test(input.charAt(peg$currPos))) {
          s0 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$c59);
          }
        }
        return s0;
      }
      function peg$parseSingleLineComment() {
        var s0, s1, s2, s3, s4;
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 2) === peg$c60) {
          s1 = peg$c60;
          peg$currPos += 2;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$c61);
          }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parse_();
          if (s2 !== peg$FAILED) {
            s3 = peg$parseOneLineString();
            if (s3 !== peg$FAILED) {
              s4 = peg$parseNewLine();
              if (s4 !== peg$FAILED) {
                peg$savedPos = s0;
                s1 = peg$c62(s3);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$FAILED;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$FAILED;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      function peg$parseOneLineString() {
        var s0, s1, s2;
        s0 = peg$currPos;
        s1 = [];
        s2 = peg$parseNonLine();
        while (s2 !== peg$FAILED) {
          s1.push(s2);
          s2 = peg$parseNonLine();
        }
        if (s1 !== peg$FAILED) {
          peg$savedPos = s0;
          s1 = peg$c63(s1);
        }
        s0 = s1;
        return s0;
      }
      function peg$parseDigit() {
        var s0;
        if (peg$c64.test(input.charAt(peg$currPos))) {
          s0 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$c65);
          }
        }
        return s0;
      }
      function peg$parseAlpha() {
        var s0;
        if (peg$c66.test(input.charAt(peg$currPos))) {
          s0 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$c67);
          }
        }
        return s0;
      }
      function peg$parseDoubleQuote() {
        var s0;
        if (input.charCodeAt(peg$currPos) === 34) {
          s0 = peg$c68;
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$c69);
          }
        }
        return s0;
      }
      function peg$parse_() {
        var s0, s1;
        peg$silentFails++;
        s0 = [];
        s1 = peg$parsewhitespace();
        while (s1 !== peg$FAILED) {
          s0.push(s1);
          s1 = peg$parsewhitespace();
        }
        peg$silentFails--;
        if (s0 === peg$FAILED) {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$c70);
          }
        }
        return s0;
      }
      function peg$parsewhitespace() {
        var s0;
        s0 = peg$parseNewLine();
        if (s0 === peg$FAILED) {
          if (peg$c71.test(input.charAt(peg$currPos))) {
            s0 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s0 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$c72);
            }
          }
        }
        return s0;
      }
      function peg$parseNonLine() {
        var s0, s1, s2;
        s0 = peg$currPos;
        s1 = peg$currPos;
        peg$silentFails++;
        s2 = peg$parseNewLine();
        peg$silentFails--;
        if (s2 === peg$FAILED) {
          s1 = void 0;
        } else {
          peg$currPos = s1;
          s1 = peg$FAILED;
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parseChar();
          if (s2 !== peg$FAILED) {
            peg$savedPos = s0;
            s1 = peg$c53(s2);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$FAILED;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$FAILED;
        }
        return s0;
      }
      function peg$parseLineTerminator() {
        var s0;
        s0 = peg$parseNewLine();
        if (s0 === peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 59) {
            s0 = peg$c10;
            peg$currPos++;
          } else {
            s0 = peg$FAILED;
            if (peg$silentFails === 0) {
              peg$fail(peg$c11);
            }
          }
        }
        return s0;
      }
      function peg$parseNewLine() {
        var s0;
        if (peg$c73.test(input.charAt(peg$currPos))) {
          s0 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$c74);
          }
        }
        return s0;
      }
      function peg$parseChar() {
        var s0;
        if (input.length > peg$currPos) {
          s0 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s0 = peg$FAILED;
          if (peg$silentFails === 0) {
            peg$fail(peg$c52);
          }
        }
        return s0;
      }
      peg$result = peg$startRuleFunction();
      if (peg$result !== peg$FAILED && peg$currPos === input.length) {
        return peg$result;
      } else {
        if (peg$result !== peg$FAILED && peg$currPos < input.length) {
          peg$fail(peg$endExpectation());
        }
        throw peg$buildStructuredError(
          peg$maxFailExpected,
          peg$maxFailPos < input.length ? input.charAt(peg$maxFailPos) : null,
          peg$maxFailPos < input.length ? peg$computeLocation(peg$maxFailPos, peg$maxFailPos + 1) : peg$computeLocation(peg$maxFailPos, peg$maxFailPos)
        );
      }
    }
    module2.exports = {
      SyntaxError: peg$SyntaxError,
      parse: peg$parse
    };
  }
});

// node_modules/stream-buffers/lib/constants.js
var require_constants = __commonJS({
  "node_modules/stream-buffers/lib/constants.js"(exports2, module2) {
    module2.exports = {
      DEFAULT_INITIAL_SIZE: 8 * 1024,
      DEFAULT_INCREMENT_AMOUNT: 8 * 1024,
      DEFAULT_FREQUENCY: 1,
      DEFAULT_CHUNK_SIZE: 1024
    };
  }
});

// node_modules/stream-buffers/lib/readable_streambuffer.js
var require_readable_streambuffer = __commonJS({
  "node_modules/stream-buffers/lib/readable_streambuffer.js"(exports2, module2) {
    var stream = require("stream");
    var constants = require_constants();
    var util = require("util");
    var ReadableStreamBuffer = module2.exports = function(opts) {
      var that = this;
      stream.Stream.call(this);
      opts = opts || {};
      var frequency = opts.hasOwnProperty("frequency") ? opts.frequency : constants.DEFAULT_FREQUENCY;
      var chunkSize = opts.chunkSize || constants.DEFAULT_CHUNK_SIZE;
      var initialSize = opts.initialSize || constants.DEFAULT_INITIAL_SIZE;
      var incrementAmount = opts.incrementAmount || constants.DEFAULT_INCREMENT_AMOUNT;
      var size = 0;
      var buffer = new Buffer(initialSize);
      var encoding = null;
      this.readable = true;
      this.writable = false;
      var sendData = function() {
        var amount = Math.min(chunkSize, size);
        if (amount > 0) {
          var chunk = null;
          if (encoding) {
            chunk = buffer.toString(encoding, 0, amount);
          } else {
            chunk = new Buffer(amount);
            buffer.copy(chunk, 0, 0, amount);
          }
          that.emit("data", chunk);
          if (amount < buffer.length)
            buffer.copy(buffer, 0, amount, size);
          size -= amount;
        }
        if (size === 0 && !that.readable) {
          that.emit("end");
          that.emit("close");
          if (sendData && sendData.interval) {
            clearInterval(sendData.interval);
            sendData.interval = null;
          }
        }
      };
      this.size = function() {
        return size;
      };
      this.maxSize = function() {
        return buffer.length;
      };
      var increaseBufferIfNecessary = function(incomingDataSize) {
        if (buffer.length - size < incomingDataSize) {
          var factor = Math.ceil((incomingDataSize - (buffer.length - size)) / incrementAmount);
          var newBuffer = new Buffer(buffer.length + incrementAmount * factor);
          buffer.copy(newBuffer, 0, 0, size);
          buffer = newBuffer;
        }
      };
      this.put = function(data, encoding2) {
        if (!that.readable) return;
        var wasEmpty = size === 0;
        if (Buffer.isBuffer(data)) {
          increaseBufferIfNecessary(data.length);
          data.copy(buffer, size, 0);
          size += data.length;
        } else {
          data = data + "";
          var dataSizeInBytes = Buffer.byteLength(data);
          increaseBufferIfNecessary(dataSizeInBytes);
          buffer.write(data, size, encoding2 || "utf8");
          size += dataSizeInBytes;
        }
        if (wasEmpty && size > 0) {
          this.emit("readable");
        }
        if (!this.isPaused && !frequency) {
          while (size > 0) {
            sendData();
          }
        }
      };
      this.pause = function() {
        this.isPaused = true;
        if (sendData && sendData.interval) {
          clearInterval(sendData.interval);
          delete sendData.interval;
        }
      };
      this.resume = function() {
        this.isPaused = false;
        if (sendData && !sendData.interval && frequency > 0) {
          sendData.interval = setInterval(sendData, frequency);
        }
      };
      this.destroy = function() {
        that.emit("end");
        if (sendData.interval) clearInterval(sendData.interval);
        sendData = null;
        that.readable = false;
        that.emit("close");
      };
      this.destroySoon = function() {
        that.readable = false;
        if (!sendData.interval) {
          that.emit("end");
          that.emit("close");
        }
      };
      this.setEncoding = function(_encoding) {
        encoding = _encoding;
      };
      this.resume();
    };
    util.inherits(ReadableStreamBuffer, stream.Stream);
  }
});

// node_modules/stream-buffers/lib/writable_streambuffer.js
var require_writable_streambuffer = __commonJS({
  "node_modules/stream-buffers/lib/writable_streambuffer.js"(exports2, module2) {
    var util = require("util");
    var stream = require("stream");
    var constants = require_constants();
    var WritableStreamBuffer = module2.exports = function(opts) {
      var that = this;
      stream.Stream.call(this);
      opts = opts || {};
      var initialSize = opts.initialSize || constants.DEFAULT_INITIAL_SIZE;
      var incrementAmount = opts.incrementAmount || constants.DEFAULT_INCREMENT_AMOUNT;
      var buffer = new Buffer(initialSize);
      var size = 0;
      this.writable = true;
      this.readable = false;
      this.size = function() {
        return size;
      };
      this.maxSize = function() {
        return buffer.length;
      };
      this.getContents = function(length) {
        if (!size) return false;
        var data = new Buffer(Math.min(length || size, size));
        buffer.copy(data, 0, 0, data.length);
        if (data.length < size)
          buffer.copy(buffer, 0, data.length);
        size -= data.length;
        return data;
      };
      this.getContentsAsString = function(encoding, length) {
        if (!size) return false;
        var data = buffer.toString(encoding || "utf8", 0, Math.min(length || size, size));
        var dataLength = Buffer.byteLength(data);
        if (dataLength < size)
          buffer.copy(buffer, 0, dataLength);
        size -= dataLength;
        return data;
      };
      var increaseBufferIfNecessary = function(incomingDataSize) {
        if (buffer.length - size < incomingDataSize) {
          var factor = Math.ceil((incomingDataSize - (buffer.length - size)) / incrementAmount);
          var newBuffer = new Buffer(buffer.length + incrementAmount * factor);
          buffer.copy(newBuffer, 0, 0, size);
          buffer = newBuffer;
        }
      };
      this.write = function(data, encoding, callback) {
        if (!that.writable) return;
        if (Buffer.isBuffer(data)) {
          increaseBufferIfNecessary(data.length);
          data.copy(buffer, size, 0);
          size += data.length;
        } else {
          data = data + "";
          increaseBufferIfNecessary(Buffer.byteLength(data));
          buffer.write(data, size, encoding || "utf8");
          size += Buffer.byteLength(data);
        }
        if (typeof callback === "function") {
          callback();
        }
      };
      this.end = function() {
        var args = Array.prototype.slice.apply(arguments);
        if (args.length) that.write.apply(that, args);
        that.emit("finish");
        that.destroy();
      };
      this.destroySoon = this.destroy = function() {
        that.writable = false;
        that.emit("close");
      };
    };
    util.inherits(WritableStreamBuffer, stream.Stream);
  }
});

// node_modules/stream-buffers/lib/streambuffer.js
var require_streambuffer = __commonJS({
  "node_modules/stream-buffers/lib/streambuffer.js"(exports2, module2) {
    module2.exports = require_constants();
    module2.exports.ReadableStreamBuffer = require_readable_streambuffer();
    module2.exports.WritableStreamBuffer = require_writable_streambuffer();
  }
});

// node_modules/bplist-creator/bplistCreator.js
var require_bplistCreator = __commonJS({
  "node_modules/bplist-creator/bplistCreator.js"(exports2, module2) {
    "use strict";
    var streamBuffers = require_streambuffer();
    var debug = false;
    function Real(value) {
      this.value = value;
    }
    module2.exports = function(dicts) {
      var buffer = new streamBuffers.WritableStreamBuffer();
      buffer.write(Buffer.from("bplist00"));
      if (debug) {
        console.log("create", require("util").inspect(dicts, false, 10));
      }
      if (dicts instanceof Array && dicts.length === 1) {
        dicts = dicts[0];
      }
      var entries = toEntries(dicts);
      if (debug) {
        console.log("entries", entries);
      }
      var idSizeInBytes = computeIdSizeInBytes(entries.length);
      var offsets = [];
      var offsetSizeInBytes;
      var offsetTableOffset;
      updateEntryIds();
      entries.forEach(function(entry, entryIdx) {
        offsets[entryIdx] = buffer.size();
        if (!entry) {
          buffer.write(0);
        } else {
          write(entry);
        }
      });
      writeOffsetTable();
      writeTrailer();
      return buffer.getContents();
      function updateEntryIds() {
        var strings = {};
        var entryId = 0;
        entries.forEach(function(entry) {
          if (entry.id) {
            return;
          }
          if (entry.type === "string") {
            if (!entry.bplistOverride && strings.hasOwnProperty(entry.value)) {
              entry.type = "stringref";
              entry.id = strings[entry.value];
            } else {
              strings[entry.value] = entry.id = entryId++;
            }
          } else {
            entry.id = entryId++;
          }
        });
        entries = entries.filter(function(entry) {
          return entry.type !== "stringref";
        });
      }
      function writeTrailer() {
        if (debug) {
          console.log("0x" + buffer.size().toString(16), "writeTrailer");
        }
        buffer.write(Buffer.from([0, 0, 0, 0, 0, 0]));
        if (debug) {
          console.log("0x" + buffer.size().toString(16), "writeTrailer(offsetSizeInBytes):", offsetSizeInBytes);
        }
        writeByte(offsetSizeInBytes);
        if (debug) {
          console.log("0x" + buffer.size().toString(16), "writeTrailer(offsetSizeInBytes):", idSizeInBytes);
        }
        writeByte(idSizeInBytes);
        if (debug) {
          console.log("0x" + buffer.size().toString(16), "writeTrailer(number of objects):", entries.length);
        }
        writeLong(entries.length);
        if (debug) {
          console.log("0x" + buffer.size().toString(16), "writeTrailer(top object)");
        }
        writeLong(0);
        if (debug) {
          console.log("0x" + buffer.size().toString(16), "writeTrailer(offset table offset):", offsetTableOffset);
        }
        writeLong(offsetTableOffset);
      }
      function writeOffsetTable() {
        if (debug) {
          console.log("0x" + buffer.size().toString(16), "writeOffsetTable");
        }
        offsetTableOffset = buffer.size();
        offsetSizeInBytes = computeOffsetSizeInBytes(offsetTableOffset);
        offsets.forEach(function(offset) {
          writeBytes(offset, offsetSizeInBytes);
        });
      }
      function write(entry) {
        switch (entry.type) {
          case "dict":
            writeDict(entry);
            break;
          case "number":
          case "double":
            writeNumber(entry);
            break;
          case "UID":
            writeUID(entry);
            break;
          case "array":
            writeArray(entry);
            break;
          case "boolean":
            writeBoolean(entry);
            break;
          case "string":
          case "string-utf16":
            writeString(entry);
            break;
          case "date":
            writeDate(entry);
            break;
          case "data":
            writeData(entry);
            break;
          default:
            throw new Error("unhandled entry type: " + entry.type);
        }
      }
      function writeDate(entry) {
        writeByte(51);
        var date = Date.parse(entry.value) / 1e3 - 978307200;
        writeDouble(date);
      }
      function writeDict(entry) {
        if (debug) {
          var keysStr = entry.entryKeys.map(function(k) {
            return k.id;
          });
          var valsStr = entry.entryValues.map(function(k) {
            return k.id;
          });
          console.log("0x" + buffer.size().toString(16), "writeDict", "(id: " + entry.id + ")", "(keys: " + keysStr + ")", "(values: " + valsStr + ")");
        }
        writeIntHeader(13, entry.entryKeys.length);
        entry.entryKeys.forEach(function(entry2) {
          writeID(entry2.id);
        });
        entry.entryValues.forEach(function(entry2) {
          writeID(entry2.id);
        });
      }
      function writeNumber(entry) {
        if (debug) {
          console.log("0x" + buffer.size().toString(16), "writeNumber", entry.value, " (type: " + entry.type + ")", "(id: " + entry.id + ")");
        }
        if (typeof entry.value === "bigint") {
          var width = 16;
          var hex = entry.value.toString(width);
          var buf = Buffer.from(hex.padStart(width * 2, "0").slice(0, width * 2), "hex");
          writeByte(20);
          buffer.write(buf);
        } else if (entry.type !== "double" && parseFloat(entry.value).toFixed() == entry.value) {
          if (entry.value < 0) {
            writeByte(19);
            writeBytes(entry.value, 8, true);
          } else if (entry.value <= 255) {
            writeByte(16);
            writeBytes(entry.value, 1);
          } else if (entry.value <= 65535) {
            writeByte(17);
            writeBytes(entry.value, 2);
          } else if (entry.value <= 4294967295) {
            writeByte(18);
            writeBytes(entry.value, 4);
          } else {
            writeByte(19);
            writeBytes(entry.value, 8);
          }
        } else {
          writeByte(35);
          writeDouble(entry.value);
        }
      }
      function writeUID(entry) {
        if (debug) {
          console.log("0x" + buffer.size().toString(16), "writeUID", entry.value, " (type: " + entry.type + ")", "(id: " + entry.id + ")");
        }
        writeIntHeader(8, 0);
        writeID(entry.value);
      }
      function writeArray(entry) {
        if (debug) {
          console.log("0x" + buffer.size().toString(16), "writeArray (length: " + entry.entries.length + ")", "(id: " + entry.id + ")");
        }
        writeIntHeader(10, entry.entries.length);
        entry.entries.forEach(function(e) {
          writeID(e.id);
        });
      }
      function writeBoolean(entry) {
        if (debug) {
          console.log("0x" + buffer.size().toString(16), "writeBoolean", entry.value, "(id: " + entry.id + ")");
        }
        writeByte(entry.value ? 9 : 8);
      }
      function writeString(entry) {
        if (debug) {
          console.log("0x" + buffer.size().toString(16), "writeString", entry.value, "(id: " + entry.id + ")");
        }
        if (entry.type === "string-utf16" || mustBeUtf16(entry.value)) {
          var utf16 = Buffer.from(entry.value, "ucs2");
          writeIntHeader(6, utf16.length / 2);
          for (var i2 = 0; i2 < utf16.length; i2 += 2) {
            var t = utf16[i2 + 0];
            utf16[i2 + 0] = utf16[i2 + 1];
            utf16[i2 + 1] = t;
          }
          buffer.write(utf16);
        } else {
          var utf8 = Buffer.from(entry.value, "ascii");
          writeIntHeader(5, utf8.length);
          buffer.write(utf8);
        }
      }
      function writeData(entry) {
        if (debug) {
          console.log("0x" + buffer.size().toString(16), "writeData", entry.value, "(id: " + entry.id + ")");
        }
        writeIntHeader(4, entry.value.length);
        buffer.write(entry.value);
      }
      function writeLong(l) {
        writeBytes(l, 8);
      }
      function writeByte(b) {
        buffer.write(Buffer.from([b]));
      }
      function writeDouble(v) {
        var buf = Buffer.alloc(8);
        buf.writeDoubleBE(v, 0);
        buffer.write(buf);
      }
      function writeIntHeader(kind, value) {
        if (value < 15) {
          writeByte((kind << 4) + value);
        } else if (value < 256) {
          writeByte((kind << 4) + 15);
          writeByte(16);
          writeBytes(value, 1);
        } else if (value < 65536) {
          writeByte((kind << 4) + 15);
          writeByte(17);
          writeBytes(value, 2);
        } else {
          writeByte((kind << 4) + 15);
          writeByte(18);
          writeBytes(value, 4);
        }
      }
      function writeID(id) {
        writeBytes(id, idSizeInBytes);
      }
      function writeBytes(value, bytes, is_signedint) {
        var buf = Buffer.alloc(bytes);
        var z = 0;
        while (bytes > 4) {
          buf[z++] = is_signedint ? 255 : 0;
          bytes--;
        }
        for (var i2 = bytes - 1; i2 >= 0; i2--) {
          buf[z++] = value >> 8 * i2;
        }
        buffer.write(buf);
      }
      function mustBeUtf16(string) {
        return Buffer.byteLength(string, "utf8") != string.length;
      }
    };
    function toEntries(dicts) {
      if (dicts.bplistOverride) {
        return [dicts];
      }
      if (dicts instanceof Array) {
        return toEntriesArray(dicts);
      } else if (dicts instanceof Buffer) {
        return [
          {
            type: "data",
            value: dicts
          }
        ];
      } else if (dicts instanceof Real) {
        return [
          {
            type: "double",
            value: dicts.value
          }
        ];
      } else if (typeof dicts === "object") {
        if (dicts instanceof Date) {
          return [
            {
              type: "date",
              value: dicts
            }
          ];
        } else if (Object.keys(dicts).length == 1 && typeof dicts.UID === "number") {
          return [
            {
              type: "UID",
              value: dicts.UID
            }
          ];
        } else {
          return toEntriesObject(dicts);
        }
      } else if (typeof dicts === "string") {
        return [
          {
            type: "string",
            value: dicts
          }
        ];
      } else if (typeof dicts === "number") {
        return [
          {
            type: "number",
            value: dicts
          }
        ];
      } else if (typeof dicts === "boolean") {
        return [
          {
            type: "boolean",
            value: dicts
          }
        ];
      } else if (typeof dicts === "bigint") {
        return [
          {
            type: "number",
            value: dicts
          }
        ];
      } else {
        throw new Error("unhandled entry: " + dicts);
      }
    }
    function toEntriesArray(arr) {
      if (debug) {
        console.log("toEntriesArray");
      }
      var results = [
        {
          type: "array",
          entries: []
        }
      ];
      arr.forEach(function(v) {
        var entry = toEntries(v);
        results[0].entries.push(entry[0]);
        results = results.concat(entry);
      });
      return results;
    }
    function toEntriesObject(dict) {
      if (debug) {
        console.log("toEntriesObject");
      }
      var results = [
        {
          type: "dict",
          entryKeys: [],
          entryValues: []
        }
      ];
      Object.keys(dict).forEach(function(key2) {
        var entryKey = toEntries(key2);
        results[0].entryKeys.push(entryKey[0]);
        results = results.concat(entryKey[0]);
      });
      Object.keys(dict).forEach(function(key2) {
        var entryValue = toEntries(dict[key2]);
        results[0].entryValues.push(entryValue[0]);
        results = results.concat(entryValue);
      });
      return results;
    }
    function computeOffsetSizeInBytes(maxOffset) {
      if (maxOffset < 256) {
        return 1;
      }
      if (maxOffset < 65536) {
        return 2;
      }
      if (maxOffset < 4294967296) {
        return 4;
      }
      return 8;
    }
    function computeIdSizeInBytes(numberOfIds) {
      if (numberOfIds < 256) {
        return 1;
      }
      if (numberOfIds < 65536) {
        return 2;
      }
      return 4;
    }
    module2.exports.Real = Real;
  }
});

// node_modules/big-integer/BigInteger.js
var require_BigInteger = __commonJS({
  "node_modules/big-integer/BigInteger.js"(exports2, module2) {
    var bigInt = (function(undefined2) {
      "use strict";
      var BASE = 1e7, LOG_BASE = 7, MAX_INT = 9007199254740992, MAX_INT_ARR = smallToArray(MAX_INT), DEFAULT_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
      var supportsNativeBigInt = typeof BigInt === "function";
      function Integer(v, radix, alphabet, caseSensitive) {
        if (typeof v === "undefined") return Integer[0];
        if (typeof radix !== "undefined") return +radix === 10 && !alphabet ? parseValue(v) : parseBase(v, radix, alphabet, caseSensitive);
        return parseValue(v);
      }
      function BigInteger(value, sign) {
        this.value = value;
        this.sign = sign;
        this.isSmall = false;
      }
      BigInteger.prototype = Object.create(Integer.prototype);
      function SmallInteger(value) {
        this.value = value;
        this.sign = value < 0;
        this.isSmall = true;
      }
      SmallInteger.prototype = Object.create(Integer.prototype);
      function NativeBigInt(value) {
        this.value = value;
      }
      NativeBigInt.prototype = Object.create(Integer.prototype);
      function isPrecise(n) {
        return -MAX_INT < n && n < MAX_INT;
      }
      function smallToArray(n) {
        if (n < 1e7)
          return [n];
        if (n < 1e14)
          return [n % 1e7, Math.floor(n / 1e7)];
        return [n % 1e7, Math.floor(n / 1e7) % 1e7, Math.floor(n / 1e14)];
      }
      function arrayToSmall(arr) {
        trim(arr);
        var length = arr.length;
        if (length < 4 && compareAbs(arr, MAX_INT_ARR) < 0) {
          switch (length) {
            case 0:
              return 0;
            case 1:
              return arr[0];
            case 2:
              return arr[0] + arr[1] * BASE;
            default:
              return arr[0] + (arr[1] + arr[2] * BASE) * BASE;
          }
        }
        return arr;
      }
      function trim(v) {
        var i3 = v.length;
        while (v[--i3] === 0) ;
        v.length = i3 + 1;
      }
      function createArray(length) {
        var x = new Array(length);
        var i3 = -1;
        while (++i3 < length) {
          x[i3] = 0;
        }
        return x;
      }
      function truncate(n) {
        if (n > 0) return Math.floor(n);
        return Math.ceil(n);
      }
      function add(a, b) {
        var l_a = a.length, l_b = b.length, r = new Array(l_a), carry = 0, base = BASE, sum, i3;
        for (i3 = 0; i3 < l_b; i3++) {
          sum = a[i3] + b[i3] + carry;
          carry = sum >= base ? 1 : 0;
          r[i3] = sum - carry * base;
        }
        while (i3 < l_a) {
          sum = a[i3] + carry;
          carry = sum === base ? 1 : 0;
          r[i3++] = sum - carry * base;
        }
        if (carry > 0) r.push(carry);
        return r;
      }
      function addAny(a, b) {
        if (a.length >= b.length) return add(a, b);
        return add(b, a);
      }
      function addSmall(a, carry) {
        var l = a.length, r = new Array(l), base = BASE, sum, i3;
        for (i3 = 0; i3 < l; i3++) {
          sum = a[i3] - base + carry;
          carry = Math.floor(sum / base);
          r[i3] = sum - carry * base;
          carry += 1;
        }
        while (carry > 0) {
          r[i3++] = carry % base;
          carry = Math.floor(carry / base);
        }
        return r;
      }
      BigInteger.prototype.add = function(v) {
        var n = parseValue(v);
        if (this.sign !== n.sign) {
          return this.subtract(n.negate());
        }
        var a = this.value, b = n.value;
        if (n.isSmall) {
          return new BigInteger(addSmall(a, Math.abs(b)), this.sign);
        }
        return new BigInteger(addAny(a, b), this.sign);
      };
      BigInteger.prototype.plus = BigInteger.prototype.add;
      SmallInteger.prototype.add = function(v) {
        var n = parseValue(v);
        var a = this.value;
        if (a < 0 !== n.sign) {
          return this.subtract(n.negate());
        }
        var b = n.value;
        if (n.isSmall) {
          if (isPrecise(a + b)) return new SmallInteger(a + b);
          b = smallToArray(Math.abs(b));
        }
        return new BigInteger(addSmall(b, Math.abs(a)), a < 0);
      };
      SmallInteger.prototype.plus = SmallInteger.prototype.add;
      NativeBigInt.prototype.add = function(v) {
        return new NativeBigInt(this.value + parseValue(v).value);
      };
      NativeBigInt.prototype.plus = NativeBigInt.prototype.add;
      function subtract(a, b) {
        var a_l = a.length, b_l = b.length, r = new Array(a_l), borrow = 0, base = BASE, i3, difference;
        for (i3 = 0; i3 < b_l; i3++) {
          difference = a[i3] - borrow - b[i3];
          if (difference < 0) {
            difference += base;
            borrow = 1;
          } else borrow = 0;
          r[i3] = difference;
        }
        for (i3 = b_l; i3 < a_l; i3++) {
          difference = a[i3] - borrow;
          if (difference < 0) difference += base;
          else {
            r[i3++] = difference;
            break;
          }
          r[i3] = difference;
        }
        for (; i3 < a_l; i3++) {
          r[i3] = a[i3];
        }
        trim(r);
        return r;
      }
      function subtractAny(a, b, sign) {
        var value;
        if (compareAbs(a, b) >= 0) {
          value = subtract(a, b);
        } else {
          value = subtract(b, a);
          sign = !sign;
        }
        value = arrayToSmall(value);
        if (typeof value === "number") {
          if (sign) value = -value;
          return new SmallInteger(value);
        }
        return new BigInteger(value, sign);
      }
      function subtractSmall(a, b, sign) {
        var l = a.length, r = new Array(l), carry = -b, base = BASE, i3, difference;
        for (i3 = 0; i3 < l; i3++) {
          difference = a[i3] + carry;
          carry = Math.floor(difference / base);
          difference %= base;
          r[i3] = difference < 0 ? difference + base : difference;
        }
        r = arrayToSmall(r);
        if (typeof r === "number") {
          if (sign) r = -r;
          return new SmallInteger(r);
        }
        return new BigInteger(r, sign);
      }
      BigInteger.prototype.subtract = function(v) {
        var n = parseValue(v);
        if (this.sign !== n.sign) {
          return this.add(n.negate());
        }
        var a = this.value, b = n.value;
        if (n.isSmall)
          return subtractSmall(a, Math.abs(b), this.sign);
        return subtractAny(a, b, this.sign);
      };
      BigInteger.prototype.minus = BigInteger.prototype.subtract;
      SmallInteger.prototype.subtract = function(v) {
        var n = parseValue(v);
        var a = this.value;
        if (a < 0 !== n.sign) {
          return this.add(n.negate());
        }
        var b = n.value;
        if (n.isSmall) {
          return new SmallInteger(a - b);
        }
        return subtractSmall(b, Math.abs(a), a >= 0);
      };
      SmallInteger.prototype.minus = SmallInteger.prototype.subtract;
      NativeBigInt.prototype.subtract = function(v) {
        return new NativeBigInt(this.value - parseValue(v).value);
      };
      NativeBigInt.prototype.minus = NativeBigInt.prototype.subtract;
      BigInteger.prototype.negate = function() {
        return new BigInteger(this.value, !this.sign);
      };
      SmallInteger.prototype.negate = function() {
        var sign = this.sign;
        var small = new SmallInteger(-this.value);
        small.sign = !sign;
        return small;
      };
      NativeBigInt.prototype.negate = function() {
        return new NativeBigInt(-this.value);
      };
      BigInteger.prototype.abs = function() {
        return new BigInteger(this.value, false);
      };
      SmallInteger.prototype.abs = function() {
        return new SmallInteger(Math.abs(this.value));
      };
      NativeBigInt.prototype.abs = function() {
        return new NativeBigInt(this.value >= 0 ? this.value : -this.value);
      };
      function multiplyLong(a, b) {
        var a_l = a.length, b_l = b.length, l = a_l + b_l, r = createArray(l), base = BASE, product, carry, i3, a_i, b_j;
        for (i3 = 0; i3 < a_l; ++i3) {
          a_i = a[i3];
          for (var j = 0; j < b_l; ++j) {
            b_j = b[j];
            product = a_i * b_j + r[i3 + j];
            carry = Math.floor(product / base);
            r[i3 + j] = product - carry * base;
            r[i3 + j + 1] += carry;
          }
        }
        trim(r);
        return r;
      }
      function multiplySmall(a, b) {
        var l = a.length, r = new Array(l), base = BASE, carry = 0, product, i3;
        for (i3 = 0; i3 < l; i3++) {
          product = a[i3] * b + carry;
          carry = Math.floor(product / base);
          r[i3] = product - carry * base;
        }
        while (carry > 0) {
          r[i3++] = carry % base;
          carry = Math.floor(carry / base);
        }
        return r;
      }
      function shiftLeft(x, n) {
        var r = [];
        while (n-- > 0) r.push(0);
        return r.concat(x);
      }
      function multiplyKaratsuba(x, y) {
        var n = Math.max(x.length, y.length);
        if (n <= 30) return multiplyLong(x, y);
        n = Math.ceil(n / 2);
        var b = x.slice(n), a = x.slice(0, n), d = y.slice(n), c = y.slice(0, n);
        var ac = multiplyKaratsuba(a, c), bd = multiplyKaratsuba(b, d), abcd = multiplyKaratsuba(addAny(a, b), addAny(c, d));
        var product = addAny(addAny(ac, shiftLeft(subtract(subtract(abcd, ac), bd), n)), shiftLeft(bd, 2 * n));
        trim(product);
        return product;
      }
      function useKaratsuba(l1, l2) {
        return -0.012 * l1 - 0.012 * l2 + 15e-6 * l1 * l2 > 0;
      }
      BigInteger.prototype.multiply = function(v) {
        var n = parseValue(v), a = this.value, b = n.value, sign = this.sign !== n.sign, abs;
        if (n.isSmall) {
          if (b === 0) return Integer[0];
          if (b === 1) return this;
          if (b === -1) return this.negate();
          abs = Math.abs(b);
          if (abs < BASE) {
            return new BigInteger(multiplySmall(a, abs), sign);
          }
          b = smallToArray(abs);
        }
        if (useKaratsuba(a.length, b.length))
          return new BigInteger(multiplyKaratsuba(a, b), sign);
        return new BigInteger(multiplyLong(a, b), sign);
      };
      BigInteger.prototype.times = BigInteger.prototype.multiply;
      function multiplySmallAndArray(a, b, sign) {
        if (a < BASE) {
          return new BigInteger(multiplySmall(b, a), sign);
        }
        return new BigInteger(multiplyLong(b, smallToArray(a)), sign);
      }
      SmallInteger.prototype._multiplyBySmall = function(a) {
        if (isPrecise(a.value * this.value)) {
          return new SmallInteger(a.value * this.value);
        }
        return multiplySmallAndArray(Math.abs(a.value), smallToArray(Math.abs(this.value)), this.sign !== a.sign);
      };
      BigInteger.prototype._multiplyBySmall = function(a) {
        if (a.value === 0) return Integer[0];
        if (a.value === 1) return this;
        if (a.value === -1) return this.negate();
        return multiplySmallAndArray(Math.abs(a.value), this.value, this.sign !== a.sign);
      };
      SmallInteger.prototype.multiply = function(v) {
        return parseValue(v)._multiplyBySmall(this);
      };
      SmallInteger.prototype.times = SmallInteger.prototype.multiply;
      NativeBigInt.prototype.multiply = function(v) {
        return new NativeBigInt(this.value * parseValue(v).value);
      };
      NativeBigInt.prototype.times = NativeBigInt.prototype.multiply;
      function square(a) {
        var l = a.length, r = createArray(l + l), base = BASE, product, carry, i3, a_i, a_j;
        for (i3 = 0; i3 < l; i3++) {
          a_i = a[i3];
          carry = 0 - a_i * a_i;
          for (var j = i3; j < l; j++) {
            a_j = a[j];
            product = 2 * (a_i * a_j) + r[i3 + j] + carry;
            carry = Math.floor(product / base);
            r[i3 + j] = product - carry * base;
          }
          r[i3 + l] = carry;
        }
        trim(r);
        return r;
      }
      BigInteger.prototype.square = function() {
        return new BigInteger(square(this.value), false);
      };
      SmallInteger.prototype.square = function() {
        var value = this.value * this.value;
        if (isPrecise(value)) return new SmallInteger(value);
        return new BigInteger(square(smallToArray(Math.abs(this.value))), false);
      };
      NativeBigInt.prototype.square = function(v) {
        return new NativeBigInt(this.value * this.value);
      };
      function divMod1(a, b) {
        var a_l = a.length, b_l = b.length, base = BASE, result = createArray(b.length), divisorMostSignificantDigit = b[b_l - 1], lambda = Math.ceil(base / (2 * divisorMostSignificantDigit)), remainder = multiplySmall(a, lambda), divisor = multiplySmall(b, lambda), quotientDigit, shift, carry, borrow, i3, l, q;
        if (remainder.length <= a_l) remainder.push(0);
        divisor.push(0);
        divisorMostSignificantDigit = divisor[b_l - 1];
        for (shift = a_l - b_l; shift >= 0; shift--) {
          quotientDigit = base - 1;
          if (remainder[shift + b_l] !== divisorMostSignificantDigit) {
            quotientDigit = Math.floor((remainder[shift + b_l] * base + remainder[shift + b_l - 1]) / divisorMostSignificantDigit);
          }
          carry = 0;
          borrow = 0;
          l = divisor.length;
          for (i3 = 0; i3 < l; i3++) {
            carry += quotientDigit * divisor[i3];
            q = Math.floor(carry / base);
            borrow += remainder[shift + i3] - (carry - q * base);
            carry = q;
            if (borrow < 0) {
              remainder[shift + i3] = borrow + base;
              borrow = -1;
            } else {
              remainder[shift + i3] = borrow;
              borrow = 0;
            }
          }
          while (borrow !== 0) {
            quotientDigit -= 1;
            carry = 0;
            for (i3 = 0; i3 < l; i3++) {
              carry += remainder[shift + i3] - base + divisor[i3];
              if (carry < 0) {
                remainder[shift + i3] = carry + base;
                carry = 0;
              } else {
                remainder[shift + i3] = carry;
                carry = 1;
              }
            }
            borrow += carry;
          }
          result[shift] = quotientDigit;
        }
        remainder = divModSmall(remainder, lambda)[0];
        return [arrayToSmall(result), arrayToSmall(remainder)];
      }
      function divMod2(a, b) {
        var a_l = a.length, b_l = b.length, result = [], part = [], base = BASE, guess, xlen, highx, highy, check;
        while (a_l) {
          part.unshift(a[--a_l]);
          trim(part);
          if (compareAbs(part, b) < 0) {
            result.push(0);
            continue;
          }
          xlen = part.length;
          highx = part[xlen - 1] * base + part[xlen - 2];
          highy = b[b_l - 1] * base + b[b_l - 2];
          if (xlen > b_l) {
            highx = (highx + 1) * base;
          }
          guess = Math.ceil(highx / highy);
          do {
            check = multiplySmall(b, guess);
            if (compareAbs(check, part) <= 0) break;
            guess--;
          } while (guess);
          result.push(guess);
          part = subtract(part, check);
        }
        result.reverse();
        return [arrayToSmall(result), arrayToSmall(part)];
      }
      function divModSmall(value, lambda) {
        var length = value.length, quotient = createArray(length), base = BASE, i3, q, remainder, divisor;
        remainder = 0;
        for (i3 = length - 1; i3 >= 0; --i3) {
          divisor = remainder * base + value[i3];
          q = truncate(divisor / lambda);
          remainder = divisor - q * lambda;
          quotient[i3] = q | 0;
        }
        return [quotient, remainder | 0];
      }
      function divModAny(self, v) {
        var value, n = parseValue(v);
        if (supportsNativeBigInt) {
          return [new NativeBigInt(self.value / n.value), new NativeBigInt(self.value % n.value)];
        }
        var a = self.value, b = n.value;
        var quotient;
        if (b === 0) throw new Error("Cannot divide by zero");
        if (self.isSmall) {
          if (n.isSmall) {
            return [new SmallInteger(truncate(a / b)), new SmallInteger(a % b)];
          }
          return [Integer[0], self];
        }
        if (n.isSmall) {
          if (b === 1) return [self, Integer[0]];
          if (b == -1) return [self.negate(), Integer[0]];
          var abs = Math.abs(b);
          if (abs < BASE) {
            value = divModSmall(a, abs);
            quotient = arrayToSmall(value[0]);
            var remainder = value[1];
            if (self.sign) remainder = -remainder;
            if (typeof quotient === "number") {
              if (self.sign !== n.sign) quotient = -quotient;
              return [new SmallInteger(quotient), new SmallInteger(remainder)];
            }
            return [new BigInteger(quotient, self.sign !== n.sign), new SmallInteger(remainder)];
          }
          b = smallToArray(abs);
        }
        var comparison = compareAbs(a, b);
        if (comparison === -1) return [Integer[0], self];
        if (comparison === 0) return [Integer[self.sign === n.sign ? 1 : -1], Integer[0]];
        if (a.length + b.length <= 200)
          value = divMod1(a, b);
        else value = divMod2(a, b);
        quotient = value[0];
        var qSign = self.sign !== n.sign, mod = value[1], mSign = self.sign;
        if (typeof quotient === "number") {
          if (qSign) quotient = -quotient;
          quotient = new SmallInteger(quotient);
        } else quotient = new BigInteger(quotient, qSign);
        if (typeof mod === "number") {
          if (mSign) mod = -mod;
          mod = new SmallInteger(mod);
        } else mod = new BigInteger(mod, mSign);
        return [quotient, mod];
      }
      BigInteger.prototype.divmod = function(v) {
        var result = divModAny(this, v);
        return {
          quotient: result[0],
          remainder: result[1]
        };
      };
      NativeBigInt.prototype.divmod = SmallInteger.prototype.divmod = BigInteger.prototype.divmod;
      BigInteger.prototype.divide = function(v) {
        return divModAny(this, v)[0];
      };
      NativeBigInt.prototype.over = NativeBigInt.prototype.divide = function(v) {
        return new NativeBigInt(this.value / parseValue(v).value);
      };
      SmallInteger.prototype.over = SmallInteger.prototype.divide = BigInteger.prototype.over = BigInteger.prototype.divide;
      BigInteger.prototype.mod = function(v) {
        return divModAny(this, v)[1];
      };
      NativeBigInt.prototype.mod = NativeBigInt.prototype.remainder = function(v) {
        return new NativeBigInt(this.value % parseValue(v).value);
      };
      SmallInteger.prototype.remainder = SmallInteger.prototype.mod = BigInteger.prototype.remainder = BigInteger.prototype.mod;
      BigInteger.prototype.pow = function(v) {
        var n = parseValue(v), a = this.value, b = n.value, value, x, y;
        if (b === 0) return Integer[1];
        if (a === 0) return Integer[0];
        if (a === 1) return Integer[1];
        if (a === -1) return n.isEven() ? Integer[1] : Integer[-1];
        if (n.sign) {
          return Integer[0];
        }
        if (!n.isSmall) throw new Error("The exponent " + n.toString() + " is too large.");
        if (this.isSmall) {
          if (isPrecise(value = Math.pow(a, b)))
            return new SmallInteger(truncate(value));
        }
        x = this;
        y = Integer[1];
        while (true) {
          if (b & true) {
            y = y.times(x);
            --b;
          }
          if (b === 0) break;
          b /= 2;
          x = x.square();
        }
        return y;
      };
      SmallInteger.prototype.pow = BigInteger.prototype.pow;
      NativeBigInt.prototype.pow = function(v) {
        var n = parseValue(v);
        var a = this.value, b = n.value;
        var _0 = BigInt(0), _1 = BigInt(1), _2 = BigInt(2);
        if (b === _0) return Integer[1];
        if (a === _0) return Integer[0];
        if (a === _1) return Integer[1];
        if (a === BigInt(-1)) return n.isEven() ? Integer[1] : Integer[-1];
        if (n.isNegative()) return new NativeBigInt(_0);
        var x = this;
        var y = Integer[1];
        while (true) {
          if ((b & _1) === _1) {
            y = y.times(x);
            --b;
          }
          if (b === _0) break;
          b /= _2;
          x = x.square();
        }
        return y;
      };
      BigInteger.prototype.modPow = function(exp, mod) {
        exp = parseValue(exp);
        mod = parseValue(mod);
        if (mod.isZero()) throw new Error("Cannot take modPow with modulus 0");
        var r = Integer[1], base = this.mod(mod);
        if (exp.isNegative()) {
          exp = exp.multiply(Integer[-1]);
          base = base.modInv(mod);
        }
        while (exp.isPositive()) {
          if (base.isZero()) return Integer[0];
          if (exp.isOdd()) r = r.multiply(base).mod(mod);
          exp = exp.divide(2);
          base = base.square().mod(mod);
        }
        return r;
      };
      NativeBigInt.prototype.modPow = SmallInteger.prototype.modPow = BigInteger.prototype.modPow;
      function compareAbs(a, b) {
        if (a.length !== b.length) {
          return a.length > b.length ? 1 : -1;
        }
        for (var i3 = a.length - 1; i3 >= 0; i3--) {
          if (a[i3] !== b[i3]) return a[i3] > b[i3] ? 1 : -1;
        }
        return 0;
      }
      BigInteger.prototype.compareAbs = function(v) {
        var n = parseValue(v), a = this.value, b = n.value;
        if (n.isSmall) return 1;
        return compareAbs(a, b);
      };
      SmallInteger.prototype.compareAbs = function(v) {
        var n = parseValue(v), a = Math.abs(this.value), b = n.value;
        if (n.isSmall) {
          b = Math.abs(b);
          return a === b ? 0 : a > b ? 1 : -1;
        }
        return -1;
      };
      NativeBigInt.prototype.compareAbs = function(v) {
        var a = this.value;
        var b = parseValue(v).value;
        a = a >= 0 ? a : -a;
        b = b >= 0 ? b : -b;
        return a === b ? 0 : a > b ? 1 : -1;
      };
      BigInteger.prototype.compare = function(v) {
        if (v === Infinity) {
          return -1;
        }
        if (v === -Infinity) {
          return 1;
        }
        var n = parseValue(v), a = this.value, b = n.value;
        if (this.sign !== n.sign) {
          return n.sign ? 1 : -1;
        }
        if (n.isSmall) {
          return this.sign ? -1 : 1;
        }
        return compareAbs(a, b) * (this.sign ? -1 : 1);
      };
      BigInteger.prototype.compareTo = BigInteger.prototype.compare;
      SmallInteger.prototype.compare = function(v) {
        if (v === Infinity) {
          return -1;
        }
        if (v === -Infinity) {
          return 1;
        }
        var n = parseValue(v), a = this.value, b = n.value;
        if (n.isSmall) {
          return a == b ? 0 : a > b ? 1 : -1;
        }
        if (a < 0 !== n.sign) {
          return a < 0 ? -1 : 1;
        }
        return a < 0 ? 1 : -1;
      };
      SmallInteger.prototype.compareTo = SmallInteger.prototype.compare;
      NativeBigInt.prototype.compare = function(v) {
        if (v === Infinity) {
          return -1;
        }
        if (v === -Infinity) {
          return 1;
        }
        var a = this.value;
        var b = parseValue(v).value;
        return a === b ? 0 : a > b ? 1 : -1;
      };
      NativeBigInt.prototype.compareTo = NativeBigInt.prototype.compare;
      BigInteger.prototype.equals = function(v) {
        return this.compare(v) === 0;
      };
      NativeBigInt.prototype.eq = NativeBigInt.prototype.equals = SmallInteger.prototype.eq = SmallInteger.prototype.equals = BigInteger.prototype.eq = BigInteger.prototype.equals;
      BigInteger.prototype.notEquals = function(v) {
        return this.compare(v) !== 0;
      };
      NativeBigInt.prototype.neq = NativeBigInt.prototype.notEquals = SmallInteger.prototype.neq = SmallInteger.prototype.notEquals = BigInteger.prototype.neq = BigInteger.prototype.notEquals;
      BigInteger.prototype.greater = function(v) {
        return this.compare(v) > 0;
      };
      NativeBigInt.prototype.gt = NativeBigInt.prototype.greater = SmallInteger.prototype.gt = SmallInteger.prototype.greater = BigInteger.prototype.gt = BigInteger.prototype.greater;
      BigInteger.prototype.lesser = function(v) {
        return this.compare(v) < 0;
      };
      NativeBigInt.prototype.lt = NativeBigInt.prototype.lesser = SmallInteger.prototype.lt = SmallInteger.prototype.lesser = BigInteger.prototype.lt = BigInteger.prototype.lesser;
      BigInteger.prototype.greaterOrEquals = function(v) {
        return this.compare(v) >= 0;
      };
      NativeBigInt.prototype.geq = NativeBigInt.prototype.greaterOrEquals = SmallInteger.prototype.geq = SmallInteger.prototype.greaterOrEquals = BigInteger.prototype.geq = BigInteger.prototype.greaterOrEquals;
      BigInteger.prototype.lesserOrEquals = function(v) {
        return this.compare(v) <= 0;
      };
      NativeBigInt.prototype.leq = NativeBigInt.prototype.lesserOrEquals = SmallInteger.prototype.leq = SmallInteger.prototype.lesserOrEquals = BigInteger.prototype.leq = BigInteger.prototype.lesserOrEquals;
      BigInteger.prototype.isEven = function() {
        return (this.value[0] & 1) === 0;
      };
      SmallInteger.prototype.isEven = function() {
        return (this.value & 1) === 0;
      };
      NativeBigInt.prototype.isEven = function() {
        return (this.value & BigInt(1)) === BigInt(0);
      };
      BigInteger.prototype.isOdd = function() {
        return (this.value[0] & 1) === 1;
      };
      SmallInteger.prototype.isOdd = function() {
        return (this.value & 1) === 1;
      };
      NativeBigInt.prototype.isOdd = function() {
        return (this.value & BigInt(1)) === BigInt(1);
      };
      BigInteger.prototype.isPositive = function() {
        return !this.sign;
      };
      SmallInteger.prototype.isPositive = function() {
        return this.value > 0;
      };
      NativeBigInt.prototype.isPositive = SmallInteger.prototype.isPositive;
      BigInteger.prototype.isNegative = function() {
        return this.sign;
      };
      SmallInteger.prototype.isNegative = function() {
        return this.value < 0;
      };
      NativeBigInt.prototype.isNegative = SmallInteger.prototype.isNegative;
      BigInteger.prototype.isUnit = function() {
        return false;
      };
      SmallInteger.prototype.isUnit = function() {
        return Math.abs(this.value) === 1;
      };
      NativeBigInt.prototype.isUnit = function() {
        return this.abs().value === BigInt(1);
      };
      BigInteger.prototype.isZero = function() {
        return false;
      };
      SmallInteger.prototype.isZero = function() {
        return this.value === 0;
      };
      NativeBigInt.prototype.isZero = function() {
        return this.value === BigInt(0);
      };
      BigInteger.prototype.isDivisibleBy = function(v) {
        var n = parseValue(v);
        if (n.isZero()) return false;
        if (n.isUnit()) return true;
        if (n.compareAbs(2) === 0) return this.isEven();
        return this.mod(n).isZero();
      };
      NativeBigInt.prototype.isDivisibleBy = SmallInteger.prototype.isDivisibleBy = BigInteger.prototype.isDivisibleBy;
      function isBasicPrime(v) {
        var n = v.abs();
        if (n.isUnit()) return false;
        if (n.equals(2) || n.equals(3) || n.equals(5)) return true;
        if (n.isEven() || n.isDivisibleBy(3) || n.isDivisibleBy(5)) return false;
        if (n.lesser(49)) return true;
      }
      function millerRabinTest(n, a) {
        var nPrev = n.prev(), b = nPrev, r = 0, d, t, i3, x;
        while (b.isEven()) b = b.divide(2), r++;
        next: for (i3 = 0; i3 < a.length; i3++) {
          if (n.lesser(a[i3])) continue;
          x = bigInt(a[i3]).modPow(b, n);
          if (x.isUnit() || x.equals(nPrev)) continue;
          for (d = r - 1; d != 0; d--) {
            x = x.square().mod(n);
            if (x.isUnit()) return false;
            if (x.equals(nPrev)) continue next;
          }
          return false;
        }
        return true;
      }
      BigInteger.prototype.isPrime = function(strict) {
        var isPrime = isBasicPrime(this);
        if (isPrime !== undefined2) return isPrime;
        var n = this.abs();
        var bits = n.bitLength();
        if (bits <= 64)
          return millerRabinTest(n, [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37]);
        var logN = Math.log(2) * bits.toJSNumber();
        var t = Math.ceil(strict === true ? 2 * Math.pow(logN, 2) : logN);
        for (var a = [], i3 = 0; i3 < t; i3++) {
          a.push(bigInt(i3 + 2));
        }
        return millerRabinTest(n, a);
      };
      NativeBigInt.prototype.isPrime = SmallInteger.prototype.isPrime = BigInteger.prototype.isPrime;
      BigInteger.prototype.isProbablePrime = function(iterations, rng) {
        var isPrime = isBasicPrime(this);
        if (isPrime !== undefined2) return isPrime;
        var n = this.abs();
        var t = iterations === undefined2 ? 5 : iterations;
        for (var a = [], i3 = 0; i3 < t; i3++) {
          a.push(bigInt.randBetween(2, n.minus(2), rng));
        }
        return millerRabinTest(n, a);
      };
      NativeBigInt.prototype.isProbablePrime = SmallInteger.prototype.isProbablePrime = BigInteger.prototype.isProbablePrime;
      BigInteger.prototype.modInv = function(n) {
        var t = bigInt.zero, newT = bigInt.one, r = parseValue(n), newR = this.abs(), q, lastT, lastR;
        while (!newR.isZero()) {
          q = r.divide(newR);
          lastT = t;
          lastR = r;
          t = newT;
          r = newR;
          newT = lastT.subtract(q.multiply(newT));
          newR = lastR.subtract(q.multiply(newR));
        }
        if (!r.isUnit()) throw new Error(this.toString() + " and " + n.toString() + " are not co-prime");
        if (t.compare(0) === -1) {
          t = t.add(n);
        }
        if (this.isNegative()) {
          return t.negate();
        }
        return t;
      };
      NativeBigInt.prototype.modInv = SmallInteger.prototype.modInv = BigInteger.prototype.modInv;
      BigInteger.prototype.next = function() {
        var value = this.value;
        if (this.sign) {
          return subtractSmall(value, 1, this.sign);
        }
        return new BigInteger(addSmall(value, 1), this.sign);
      };
      SmallInteger.prototype.next = function() {
        var value = this.value;
        if (value + 1 < MAX_INT) return new SmallInteger(value + 1);
        return new BigInteger(MAX_INT_ARR, false);
      };
      NativeBigInt.prototype.next = function() {
        return new NativeBigInt(this.value + BigInt(1));
      };
      BigInteger.prototype.prev = function() {
        var value = this.value;
        if (this.sign) {
          return new BigInteger(addSmall(value, 1), true);
        }
        return subtractSmall(value, 1, this.sign);
      };
      SmallInteger.prototype.prev = function() {
        var value = this.value;
        if (value - 1 > -MAX_INT) return new SmallInteger(value - 1);
        return new BigInteger(MAX_INT_ARR, true);
      };
      NativeBigInt.prototype.prev = function() {
        return new NativeBigInt(this.value - BigInt(1));
      };
      var powersOfTwo = [1];
      while (2 * powersOfTwo[powersOfTwo.length - 1] <= BASE) powersOfTwo.push(2 * powersOfTwo[powersOfTwo.length - 1]);
      var powers2Length = powersOfTwo.length, highestPower2 = powersOfTwo[powers2Length - 1];
      function shift_isSmall(n) {
        return Math.abs(n) <= BASE;
      }
      BigInteger.prototype.shiftLeft = function(v) {
        var n = parseValue(v).toJSNumber();
        if (!shift_isSmall(n)) {
          throw new Error(String(n) + " is too large for shifting.");
        }
        if (n < 0) return this.shiftRight(-n);
        var result = this;
        if (result.isZero()) return result;
        while (n >= powers2Length) {
          result = result.multiply(highestPower2);
          n -= powers2Length - 1;
        }
        return result.multiply(powersOfTwo[n]);
      };
      NativeBigInt.prototype.shiftLeft = SmallInteger.prototype.shiftLeft = BigInteger.prototype.shiftLeft;
      BigInteger.prototype.shiftRight = function(v) {
        var remQuo;
        var n = parseValue(v).toJSNumber();
        if (!shift_isSmall(n)) {
          throw new Error(String(n) + " is too large for shifting.");
        }
        if (n < 0) return this.shiftLeft(-n);
        var result = this;
        while (n >= powers2Length) {
          if (result.isZero() || result.isNegative() && result.isUnit()) return result;
          remQuo = divModAny(result, highestPower2);
          result = remQuo[1].isNegative() ? remQuo[0].prev() : remQuo[0];
          n -= powers2Length - 1;
        }
        remQuo = divModAny(result, powersOfTwo[n]);
        return remQuo[1].isNegative() ? remQuo[0].prev() : remQuo[0];
      };
      NativeBigInt.prototype.shiftRight = SmallInteger.prototype.shiftRight = BigInteger.prototype.shiftRight;
      function bitwise(x, y, fn) {
        y = parseValue(y);
        var xSign = x.isNegative(), ySign = y.isNegative();
        var xRem = xSign ? x.not() : x, yRem = ySign ? y.not() : y;
        var xDigit = 0, yDigit = 0;
        var xDivMod = null, yDivMod = null;
        var result = [];
        while (!xRem.isZero() || !yRem.isZero()) {
          xDivMod = divModAny(xRem, highestPower2);
          xDigit = xDivMod[1].toJSNumber();
          if (xSign) {
            xDigit = highestPower2 - 1 - xDigit;
          }
          yDivMod = divModAny(yRem, highestPower2);
          yDigit = yDivMod[1].toJSNumber();
          if (ySign) {
            yDigit = highestPower2 - 1 - yDigit;
          }
          xRem = xDivMod[0];
          yRem = yDivMod[0];
          result.push(fn(xDigit, yDigit));
        }
        var sum = fn(xSign ? 1 : 0, ySign ? 1 : 0) !== 0 ? bigInt(-1) : bigInt(0);
        for (var i3 = result.length - 1; i3 >= 0; i3 -= 1) {
          sum = sum.multiply(highestPower2).add(bigInt(result[i3]));
        }
        return sum;
      }
      BigInteger.prototype.not = function() {
        return this.negate().prev();
      };
      NativeBigInt.prototype.not = SmallInteger.prototype.not = BigInteger.prototype.not;
      BigInteger.prototype.and = function(n) {
        return bitwise(this, n, function(a, b) {
          return a & b;
        });
      };
      NativeBigInt.prototype.and = SmallInteger.prototype.and = BigInteger.prototype.and;
      BigInteger.prototype.or = function(n) {
        return bitwise(this, n, function(a, b) {
          return a | b;
        });
      };
      NativeBigInt.prototype.or = SmallInteger.prototype.or = BigInteger.prototype.or;
      BigInteger.prototype.xor = function(n) {
        return bitwise(this, n, function(a, b) {
          return a ^ b;
        });
      };
      NativeBigInt.prototype.xor = SmallInteger.prototype.xor = BigInteger.prototype.xor;
      var LOBMASK_I = 1 << 30, LOBMASK_BI = (BASE & -BASE) * (BASE & -BASE) | LOBMASK_I;
      function roughLOB(n) {
        var v = n.value, x = typeof v === "number" ? v | LOBMASK_I : typeof v === "bigint" ? v | BigInt(LOBMASK_I) : v[0] + v[1] * BASE | LOBMASK_BI;
        return x & -x;
      }
      function integerLogarithm(value, base) {
        if (base.compareTo(value) <= 0) {
          var tmp = integerLogarithm(value, base.square(base));
          var p = tmp.p;
          var e = tmp.e;
          var t = p.multiply(base);
          return t.compareTo(value) <= 0 ? { p: t, e: e * 2 + 1 } : { p, e: e * 2 };
        }
        return { p: bigInt(1), e: 0 };
      }
      BigInteger.prototype.bitLength = function() {
        var n = this;
        if (n.compareTo(bigInt(0)) < 0) {
          n = n.negate().subtract(bigInt(1));
        }
        if (n.compareTo(bigInt(0)) === 0) {
          return bigInt(0);
        }
        return bigInt(integerLogarithm(n, bigInt(2)).e).add(bigInt(1));
      };
      NativeBigInt.prototype.bitLength = SmallInteger.prototype.bitLength = BigInteger.prototype.bitLength;
      function max(a, b) {
        a = parseValue(a);
        b = parseValue(b);
        return a.greater(b) ? a : b;
      }
      function min(a, b) {
        a = parseValue(a);
        b = parseValue(b);
        return a.lesser(b) ? a : b;
      }
      function gcd(a, b) {
        a = parseValue(a).abs();
        b = parseValue(b).abs();
        if (a.equals(b)) return a;
        if (a.isZero()) return b;
        if (b.isZero()) return a;
        var c = Integer[1], d, t;
        while (a.isEven() && b.isEven()) {
          d = min(roughLOB(a), roughLOB(b));
          a = a.divide(d);
          b = b.divide(d);
          c = c.multiply(d);
        }
        while (a.isEven()) {
          a = a.divide(roughLOB(a));
        }
        do {
          while (b.isEven()) {
            b = b.divide(roughLOB(b));
          }
          if (a.greater(b)) {
            t = b;
            b = a;
            a = t;
          }
          b = b.subtract(a);
        } while (!b.isZero());
        return c.isUnit() ? a : a.multiply(c);
      }
      function lcm(a, b) {
        a = parseValue(a).abs();
        b = parseValue(b).abs();
        return a.divide(gcd(a, b)).multiply(b);
      }
      function randBetween(a, b, rng) {
        a = parseValue(a);
        b = parseValue(b);
        var usedRNG = rng || Math.random;
        var low = min(a, b), high = max(a, b);
        var range = high.subtract(low).add(1);
        if (range.isSmall) return low.add(Math.floor(usedRNG() * range));
        var digits = toBase(range, BASE).value;
        var result = [], restricted = true;
        for (var i3 = 0; i3 < digits.length; i3++) {
          var top = restricted ? digits[i3] + (i3 + 1 < digits.length ? digits[i3 + 1] / BASE : 0) : BASE;
          var digit = truncate(usedRNG() * top);
          result.push(digit);
          if (digit < digits[i3]) restricted = false;
        }
        return low.add(Integer.fromArray(result, BASE, false));
      }
      var parseBase = function(text, base, alphabet, caseSensitive) {
        alphabet = alphabet || DEFAULT_ALPHABET;
        text = String(text);
        if (!caseSensitive) {
          text = text.toLowerCase();
          alphabet = alphabet.toLowerCase();
        }
        var length = text.length;
        var i3;
        var absBase = Math.abs(base);
        var alphabetValues = {};
        for (i3 = 0; i3 < alphabet.length; i3++) {
          alphabetValues[alphabet[i3]] = i3;
        }
        for (i3 = 0; i3 < length; i3++) {
          var c = text[i3];
          if (c === "-") continue;
          if (c in alphabetValues) {
            if (alphabetValues[c] >= absBase) {
              if (c === "1" && absBase === 1) continue;
              throw new Error(c + " is not a valid digit in base " + base + ".");
            }
          }
        }
        base = parseValue(base);
        var digits = [];
        var isNegative = text[0] === "-";
        for (i3 = isNegative ? 1 : 0; i3 < text.length; i3++) {
          var c = text[i3];
          if (c in alphabetValues) digits.push(parseValue(alphabetValues[c]));
          else if (c === "<") {
            var start = i3;
            do {
              i3++;
            } while (text[i3] !== ">" && i3 < text.length);
            digits.push(parseValue(text.slice(start + 1, i3)));
          } else throw new Error(c + " is not a valid character");
        }
        return parseBaseFromArray(digits, base, isNegative);
      };
      function parseBaseFromArray(digits, base, isNegative) {
        var val = Integer[0], pow = Integer[1], i3;
        for (i3 = digits.length - 1; i3 >= 0; i3--) {
          val = val.add(digits[i3].times(pow));
          pow = pow.times(base);
        }
        return isNegative ? val.negate() : val;
      }
      function stringify(digit, alphabet) {
        alphabet = alphabet || DEFAULT_ALPHABET;
        if (digit < alphabet.length) {
          return alphabet[digit];
        }
        return "<" + digit + ">";
      }
      function toBase(n, base) {
        base = bigInt(base);
        if (base.isZero()) {
          if (n.isZero()) return { value: [0], isNegative: false };
          throw new Error("Cannot convert nonzero numbers to base 0.");
        }
        if (base.equals(-1)) {
          if (n.isZero()) return { value: [0], isNegative: false };
          if (n.isNegative())
            return {
              value: [].concat.apply(
                [],
                Array.apply(null, Array(-n.toJSNumber())).map(Array.prototype.valueOf, [1, 0])
              ),
              isNegative: false
            };
          var arr = Array.apply(null, Array(n.toJSNumber() - 1)).map(Array.prototype.valueOf, [0, 1]);
          arr.unshift([1]);
          return {
            value: [].concat.apply([], arr),
            isNegative: false
          };
        }
        var neg = false;
        if (n.isNegative() && base.isPositive()) {
          neg = true;
          n = n.abs();
        }
        if (base.isUnit()) {
          if (n.isZero()) return { value: [0], isNegative: false };
          return {
            value: Array.apply(null, Array(n.toJSNumber())).map(Number.prototype.valueOf, 1),
            isNegative: neg
          };
        }
        var out = [];
        var left = n, divmod;
        while (left.isNegative() || left.compareAbs(base) >= 0) {
          divmod = left.divmod(base);
          left = divmod.quotient;
          var digit = divmod.remainder;
          if (digit.isNegative()) {
            digit = base.minus(digit).abs();
            left = left.next();
          }
          out.push(digit.toJSNumber());
        }
        out.push(left.toJSNumber());
        return { value: out.reverse(), isNegative: neg };
      }
      function toBaseString(n, base, alphabet) {
        var arr = toBase(n, base);
        return (arr.isNegative ? "-" : "") + arr.value.map(function(x) {
          return stringify(x, alphabet);
        }).join("");
      }
      BigInteger.prototype.toArray = function(radix) {
        return toBase(this, radix);
      };
      SmallInteger.prototype.toArray = function(radix) {
        return toBase(this, radix);
      };
      NativeBigInt.prototype.toArray = function(radix) {
        return toBase(this, radix);
      };
      BigInteger.prototype.toString = function(radix, alphabet) {
        if (radix === undefined2) radix = 10;
        if (radix !== 10 || alphabet) return toBaseString(this, radix, alphabet);
        var v = this.value, l = v.length, str = String(v[--l]), zeros = "0000000", digit;
        while (--l >= 0) {
          digit = String(v[l]);
          str += zeros.slice(digit.length) + digit;
        }
        var sign = this.sign ? "-" : "";
        return sign + str;
      };
      SmallInteger.prototype.toString = function(radix, alphabet) {
        if (radix === undefined2) radix = 10;
        if (radix != 10 || alphabet) return toBaseString(this, radix, alphabet);
        return String(this.value);
      };
      NativeBigInt.prototype.toString = SmallInteger.prototype.toString;
      NativeBigInt.prototype.toJSON = BigInteger.prototype.toJSON = SmallInteger.prototype.toJSON = function() {
        return this.toString();
      };
      BigInteger.prototype.valueOf = function() {
        return parseInt(this.toString(), 10);
      };
      BigInteger.prototype.toJSNumber = BigInteger.prototype.valueOf;
      SmallInteger.prototype.valueOf = function() {
        return this.value;
      };
      SmallInteger.prototype.toJSNumber = SmallInteger.prototype.valueOf;
      NativeBigInt.prototype.valueOf = NativeBigInt.prototype.toJSNumber = function() {
        return parseInt(this.toString(), 10);
      };
      function parseStringValue(v) {
        if (isPrecise(+v)) {
          var x = +v;
          if (x === truncate(x))
            return supportsNativeBigInt ? new NativeBigInt(BigInt(x)) : new SmallInteger(x);
          throw new Error("Invalid integer: " + v);
        }
        var sign = v[0] === "-";
        if (sign) v = v.slice(1);
        var split = v.split(/e/i);
        if (split.length > 2) throw new Error("Invalid integer: " + split.join("e"));
        if (split.length === 2) {
          var exp = split[1];
          if (exp[0] === "+") exp = exp.slice(1);
          exp = +exp;
          if (exp !== truncate(exp) || !isPrecise(exp)) throw new Error("Invalid integer: " + exp + " is not a valid exponent.");
          var text = split[0];
          var decimalPlace = text.indexOf(".");
          if (decimalPlace >= 0) {
            exp -= text.length - decimalPlace - 1;
            text = text.slice(0, decimalPlace) + text.slice(decimalPlace + 1);
          }
          if (exp < 0) throw new Error("Cannot include negative exponent part for integers");
          text += new Array(exp + 1).join("0");
          v = text;
        }
        var isValid = /^([0-9][0-9]*)$/.test(v);
        if (!isValid) throw new Error("Invalid integer: " + v);
        if (supportsNativeBigInt) {
          return new NativeBigInt(BigInt(sign ? "-" + v : v));
        }
        var r = [], max2 = v.length, l = LOG_BASE, min2 = max2 - l;
        while (max2 > 0) {
          r.push(+v.slice(min2, max2));
          min2 -= l;
          if (min2 < 0) min2 = 0;
          max2 -= l;
        }
        trim(r);
        return new BigInteger(r, sign);
      }
      function parseNumberValue(v) {
        if (supportsNativeBigInt) {
          return new NativeBigInt(BigInt(v));
        }
        if (isPrecise(v)) {
          if (v !== truncate(v)) throw new Error(v + " is not an integer.");
          return new SmallInteger(v);
        }
        return parseStringValue(v.toString());
      }
      function parseValue(v) {
        if (typeof v === "number") {
          return parseNumberValue(v);
        }
        if (typeof v === "string") {
          return parseStringValue(v);
        }
        if (typeof v === "bigint") {
          return new NativeBigInt(v);
        }
        return v;
      }
      for (var i2 = 0; i2 < 1e3; i2++) {
        Integer[i2] = parseValue(i2);
        if (i2 > 0) Integer[-i2] = parseValue(-i2);
      }
      Integer.one = Integer[1];
      Integer.zero = Integer[0];
      Integer.minusOne = Integer[-1];
      Integer.max = max;
      Integer.min = min;
      Integer.gcd = gcd;
      Integer.lcm = lcm;
      Integer.isInstance = function(x) {
        return x instanceof BigInteger || x instanceof SmallInteger || x instanceof NativeBigInt;
      };
      Integer.randBetween = randBetween;
      Integer.fromArray = function(digits, base, isNegative) {
        return parseBaseFromArray(digits.map(parseValue), parseValue(base || 10), isNegative);
      };
      return Integer;
    })();
    if (typeof module2 !== "undefined" && module2.hasOwnProperty("exports")) {
      module2.exports = bigInt;
    }
    if (typeof define === "function" && define.amd) {
      define(function() {
        return bigInt;
      });
    }
  }
});

// node_modules/bplist-parser/bplistParser.js
var require_bplistParser = __commonJS({
  "node_modules/bplist-parser/bplistParser.js"(exports2) {
    "use strict";
    var fs2 = require("fs");
    var bigInt = require_BigInteger();
    var debug = false;
    exports2.maxObjectSize = 100 * 1e3 * 1e3;
    exports2.maxObjectCount = 32768;
    var EPOCH = 9783072e5;
    var UID = exports2.UID = function(id) {
      this.UID = id;
    };
    exports2.parseFile = function(fileNameOrBuffer, callback) {
      return new Promise(function(resolve, reject) {
        function tryParseBuffer(buffer) {
          let err = null;
          let result;
          try {
            result = parseBuffer(buffer);
            resolve(result);
          } catch (ex) {
            err = ex;
            reject(err);
          } finally {
            if (callback) callback(err, result);
          }
        }
        if (Buffer.isBuffer(fileNameOrBuffer)) {
          return tryParseBuffer(fileNameOrBuffer);
        }
        fs2.readFile(fileNameOrBuffer, function(err, data) {
          if (err) {
            reject(err);
            return callback(err);
          }
          tryParseBuffer(data);
        });
      });
    };
    var parseBuffer = exports2.parseBuffer = function(buffer) {
      const header = buffer.slice(0, "bplist".length).toString("utf8");
      if (header !== "bplist") {
        throw new Error("Invalid binary plist. Expected 'bplist' at offset 0.");
      }
      const trailer = buffer.slice(buffer.length - 32, buffer.length);
      const offsetSize = trailer.readUInt8(6);
      if (debug) {
        console.log("offsetSize: " + offsetSize);
      }
      const objectRefSize = trailer.readUInt8(7);
      if (debug) {
        console.log("objectRefSize: " + objectRefSize);
      }
      const numObjects = readUInt64BE(trailer, 8);
      if (debug) {
        console.log("numObjects: " + numObjects);
      }
      const topObject = readUInt64BE(trailer, 16);
      if (debug) {
        console.log("topObject: " + topObject);
      }
      const offsetTableOffset = readUInt64BE(trailer, 24);
      if (debug) {
        console.log("offsetTableOffset: " + offsetTableOffset);
      }
      if (numObjects > exports2.maxObjectCount) {
        throw new Error("maxObjectCount exceeded");
      }
      const offsetTable = [];
      for (let i2 = 0; i2 < numObjects; i2++) {
        const offsetBytes = buffer.slice(offsetTableOffset + i2 * offsetSize, offsetTableOffset + (i2 + 1) * offsetSize);
        offsetTable[i2] = readUInt(offsetBytes, 0);
        if (debug) {
          console.log("Offset for Object #" + i2 + " is " + offsetTable[i2] + " [" + offsetTable[i2].toString(16) + "]");
        }
      }
      function parseObject(tableOffset) {
        const offset = offsetTable[tableOffset];
        const type = buffer[offset];
        const objType = (type & 240) >> 4;
        const objInfo = type & 15;
        switch (objType) {
          case 0:
            return parseSimple();
          case 1:
            return parseInteger();
          case 8:
            return parseUID();
          case 2:
            return parseReal();
          case 3:
            return parseDate();
          case 4:
            return parseData();
          case 5:
            return parsePlistString();
          case 6:
            return parsePlistString(true);
          case 10:
            return parseArray();
          case 13:
            return parseDictionary();
          default:
            throw new Error("Unhandled type 0x" + objType.toString(16));
        }
        function parseSimple() {
          switch (objInfo) {
            case 0:
              return null;
            case 8:
              return false;
            case 9:
              return true;
            case 15:
              return null;
            default:
              throw new Error("Unhandled simple type 0x" + objType.toString(16));
          }
        }
        function bufferToHexString(buffer2) {
          let str = "";
          let i2;
          for (i2 = 0; i2 < buffer2.length; i2++) {
            if (buffer2[i2] != 0) {
              break;
            }
          }
          for (; i2 < buffer2.length; i2++) {
            const part = "00" + buffer2[i2].toString(16);
            str += part.substr(part.length - 2);
          }
          return str;
        }
        function parseInteger() {
          const length = Math.pow(2, objInfo);
          if (length < exports2.maxObjectSize) {
            const data = buffer.slice(offset + 1, offset + 1 + length);
            if (length === 16) {
              const str = bufferToHexString(data);
              return bigInt(str, 16);
            }
            return data.reduce((acc, curr) => {
              acc <<= 8;
              acc |= curr & 255;
              return acc;
            });
          } else {
            throw new Error("Too little heap space available! Wanted to read " + length + " bytes, but only " + exports2.maxObjectSize + " are available.");
          }
        }
        function parseUID() {
          const length = objInfo + 1;
          if (length < exports2.maxObjectSize) {
            return new UID(readUInt(buffer.slice(offset + 1, offset + 1 + length)));
          }
          throw new Error("Too little heap space available! Wanted to read " + length + " bytes, but only " + exports2.maxObjectSize + " are available.");
        }
        function parseReal() {
          const length = Math.pow(2, objInfo);
          if (length < exports2.maxObjectSize) {
            const realBuffer = buffer.slice(offset + 1, offset + 1 + length);
            if (length === 4) {
              return realBuffer.readFloatBE(0);
            }
            if (length === 8) {
              return realBuffer.readDoubleBE(0);
            }
          } else {
            throw new Error("Too little heap space available! Wanted to read " + length + " bytes, but only " + exports2.maxObjectSize + " are available.");
          }
        }
        function parseDate() {
          if (objInfo != 3) {
            console.error("Unknown date type :" + objInfo + ". Parsing anyway...");
          }
          const dateBuffer = buffer.slice(offset + 1, offset + 9);
          return new Date(EPOCH + 1e3 * dateBuffer.readDoubleBE(0));
        }
        function parseData() {
          let dataoffset = 1;
          let length = objInfo;
          if (objInfo == 15) {
            const int_type = buffer[offset + 1];
            const intType = (int_type & 240) / 16;
            if (intType != 1) {
              console.error("0x4: UNEXPECTED LENGTH-INT TYPE! " + intType);
            }
            const intInfo = int_type & 15;
            const intLength = Math.pow(2, intInfo);
            dataoffset = 2 + intLength;
            if (intLength < 3) {
              length = readUInt(buffer.slice(offset + 2, offset + 2 + intLength));
            } else {
              length = readUInt(buffer.slice(offset + 2, offset + 2 + intLength));
            }
          }
          if (length < exports2.maxObjectSize) {
            return buffer.slice(offset + dataoffset, offset + dataoffset + length);
          }
          throw new Error("Too little heap space available! Wanted to read " + length + " bytes, but only " + exports2.maxObjectSize + " are available.");
        }
        function parsePlistString(isUtf16) {
          isUtf16 = isUtf16 || 0;
          let enc = "utf8";
          let length = objInfo;
          let stroffset = 1;
          if (objInfo == 15) {
            const int_type = buffer[offset + 1];
            const intType = (int_type & 240) / 16;
            if (intType != 1) {
              console.error("UNEXPECTED LENGTH-INT TYPE! " + intType);
            }
            const intInfo = int_type & 15;
            const intLength = Math.pow(2, intInfo);
            stroffset = 2 + intLength;
            if (intLength < 3) {
              length = readUInt(buffer.slice(offset + 2, offset + 2 + intLength));
            } else {
              length = readUInt(buffer.slice(offset + 2, offset + 2 + intLength));
            }
          }
          length *= isUtf16 + 1;
          if (length < exports2.maxObjectSize) {
            let plistString = Buffer.from(buffer.slice(offset + stroffset, offset + stroffset + length));
            if (isUtf16) {
              plistString = swapBytes(plistString);
              enc = "ucs2";
            }
            return plistString.toString(enc);
          }
          throw new Error("Too little heap space available! Wanted to read " + length + " bytes, but only " + exports2.maxObjectSize + " are available.");
        }
        function parseArray() {
          let length = objInfo;
          let arrayoffset = 1;
          if (objInfo == 15) {
            const int_type = buffer[offset + 1];
            const intType = (int_type & 240) / 16;
            if (intType != 1) {
              console.error("0xa: UNEXPECTED LENGTH-INT TYPE! " + intType);
            }
            const intInfo = int_type & 15;
            const intLength = Math.pow(2, intInfo);
            arrayoffset = 2 + intLength;
            if (intLength < 3) {
              length = readUInt(buffer.slice(offset + 2, offset + 2 + intLength));
            } else {
              length = readUInt(buffer.slice(offset + 2, offset + 2 + intLength));
            }
          }
          if (length * objectRefSize > exports2.maxObjectSize) {
            throw new Error("Too little heap space available!");
          }
          const array = [];
          for (let i2 = 0; i2 < length; i2++) {
            const objRef = readUInt(buffer.slice(offset + arrayoffset + i2 * objectRefSize, offset + arrayoffset + (i2 + 1) * objectRefSize));
            array[i2] = parseObject(objRef);
          }
          return array;
        }
        function parseDictionary() {
          let length = objInfo;
          let dictoffset = 1;
          if (objInfo == 15) {
            const int_type = buffer[offset + 1];
            const intType = (int_type & 240) / 16;
            if (intType != 1) {
              console.error("0xD: UNEXPECTED LENGTH-INT TYPE! " + intType);
            }
            const intInfo = int_type & 15;
            const intLength = Math.pow(2, intInfo);
            dictoffset = 2 + intLength;
            if (intLength < 3) {
              length = readUInt(buffer.slice(offset + 2, offset + 2 + intLength));
            } else {
              length = readUInt(buffer.slice(offset + 2, offset + 2 + intLength));
            }
          }
          if (length * 2 * objectRefSize > exports2.maxObjectSize) {
            throw new Error("Too little heap space available!");
          }
          if (debug) {
            console.log("Parsing dictionary #" + tableOffset);
          }
          const dict = {};
          for (let i2 = 0; i2 < length; i2++) {
            const keyRef = readUInt(buffer.slice(offset + dictoffset + i2 * objectRefSize, offset + dictoffset + (i2 + 1) * objectRefSize));
            const valRef = readUInt(buffer.slice(offset + dictoffset + length * objectRefSize + i2 * objectRefSize, offset + dictoffset + length * objectRefSize + (i2 + 1) * objectRefSize));
            const key2 = parseObject(keyRef);
            const val = parseObject(valRef);
            if (debug) {
              console.log("  DICT #" + tableOffset + ": Mapped " + key2 + " to " + val);
            }
            dict[key2] = val;
          }
          return dict;
        }
      }
      return [parseObject(topObject)];
    };
    function readUInt(buffer, start) {
      start = start || 0;
      let l = 0;
      for (let i2 = start; i2 < buffer.length; i2++) {
        l <<= 8;
        l |= buffer[i2] & 255;
      }
      return l;
    }
    function readUInt64BE(buffer, start) {
      const data = buffer.slice(start, start + 8);
      return data.readUInt32BE(4, 8);
    }
    function swapBytes(buffer) {
      const len = buffer.length;
      for (let i2 = 0; i2 < len; i2 += 2) {
        const a = buffer[i2];
        buffer[i2] = buffer[i2 + 1];
        buffer[i2 + 1] = a;
      }
      return buffer;
    }
  }
});

// node_modules/@xmldom/xmldom/lib/conventions.js
var require_conventions = __commonJS({
  "node_modules/@xmldom/xmldom/lib/conventions.js"(exports2) {
    "use strict";
    function find(list, predicate, ac) {
      if (ac === void 0) {
        ac = Array.prototype;
      }
      if (list && typeof ac.find === "function") {
        return ac.find.call(list, predicate);
      }
      for (var i2 = 0; i2 < list.length; i2++) {
        if (hasOwn(list, i2)) {
          var item = list[i2];
          if (predicate.call(void 0, item, i2, list)) {
            return item;
          }
        }
      }
    }
    function freeze(object, oc) {
      if (oc === void 0) {
        oc = Object;
      }
      if (oc && typeof oc.getOwnPropertyDescriptors === "function") {
        object = oc.create(null, oc.getOwnPropertyDescriptors(object));
      }
      return oc && typeof oc.freeze === "function" ? oc.freeze(object) : object;
    }
    function hasOwn(object, key2) {
      return Object.prototype.hasOwnProperty.call(object, key2);
    }
    function assign(target, source) {
      if (target === null || typeof target !== "object") {
        throw new TypeError("target is not an object");
      }
      for (var key2 in source) {
        if (hasOwn(source, key2)) {
          target[key2] = source[key2];
        }
      }
      return target;
    }
    var HTML_BOOLEAN_ATTRIBUTES = freeze({
      allowfullscreen: true,
      async: true,
      autofocus: true,
      autoplay: true,
      checked: true,
      controls: true,
      default: true,
      defer: true,
      disabled: true,
      formnovalidate: true,
      hidden: true,
      ismap: true,
      itemscope: true,
      loop: true,
      multiple: true,
      muted: true,
      nomodule: true,
      novalidate: true,
      open: true,
      playsinline: true,
      readonly: true,
      required: true,
      reversed: true,
      selected: true
    });
    function isHTMLBooleanAttribute(name) {
      return hasOwn(HTML_BOOLEAN_ATTRIBUTES, name.toLowerCase());
    }
    var HTML_VOID_ELEMENTS = freeze({
      area: true,
      base: true,
      br: true,
      col: true,
      embed: true,
      hr: true,
      img: true,
      input: true,
      link: true,
      meta: true,
      param: true,
      source: true,
      track: true,
      wbr: true
    });
    function isHTMLVoidElement(tagName) {
      return hasOwn(HTML_VOID_ELEMENTS, tagName.toLowerCase());
    }
    var HTML_RAW_TEXT_ELEMENTS = freeze({
      script: false,
      style: false,
      textarea: true,
      title: true
    });
    function isHTMLRawTextElement(tagName) {
      var key2 = tagName.toLowerCase();
      return hasOwn(HTML_RAW_TEXT_ELEMENTS, key2) && !HTML_RAW_TEXT_ELEMENTS[key2];
    }
    function isHTMLEscapableRawTextElement(tagName) {
      var key2 = tagName.toLowerCase();
      return hasOwn(HTML_RAW_TEXT_ELEMENTS, key2) && HTML_RAW_TEXT_ELEMENTS[key2];
    }
    function isHTMLMimeType(mimeType) {
      return mimeType === MIME_TYPE.HTML;
    }
    function hasDefaultHTMLNamespace(mimeType) {
      return isHTMLMimeType(mimeType) || mimeType === MIME_TYPE.XML_XHTML_APPLICATION;
    }
    var MIME_TYPE = freeze({
      /**
       * `text/html`, the only mime type that triggers treating an XML document as HTML.
       *
       * @see https://www.iana.org/assignments/media-types/text/html IANA MimeType registration
       * @see https://en.wikipedia.org/wiki/HTML Wikipedia
       * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMParser/parseFromString MDN
       * @see https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#dom-domparser-parsefromstring
       *      WHATWG HTML Spec
       */
      HTML: "text/html",
      /**
       * `application/xml`, the standard mime type for XML documents.
       *
       * @see https://www.iana.org/assignments/media-types/application/xml IANA MimeType
       *      registration
       * @see https://tools.ietf.org/html/rfc7303#section-9.1 RFC 7303
       * @see https://en.wikipedia.org/wiki/XML_and_MIME Wikipedia
       */
      XML_APPLICATION: "application/xml",
      /**
       * `text/xml`, an alias for `application/xml`.
       *
       * @see https://tools.ietf.org/html/rfc7303#section-9.2 RFC 7303
       * @see https://www.iana.org/assignments/media-types/text/xml IANA MimeType registration
       * @see https://en.wikipedia.org/wiki/XML_and_MIME Wikipedia
       */
      XML_TEXT: "text/xml",
      /**
       * `application/xhtml+xml`, indicates an XML document that has the default HTML namespace,
       * but is parsed as an XML document.
       *
       * @see https://www.iana.org/assignments/media-types/application/xhtml+xml IANA MimeType
       *      registration
       * @see https://dom.spec.whatwg.org/#dom-domimplementation-createdocument WHATWG DOM Spec
       * @see https://en.wikipedia.org/wiki/XHTML Wikipedia
       */
      XML_XHTML_APPLICATION: "application/xhtml+xml",
      /**
       * `image/svg+xml`,
       *
       * @see https://www.iana.org/assignments/media-types/image/svg+xml IANA MimeType registration
       * @see https://www.w3.org/TR/SVG11/ W3C SVG 1.1
       * @see https://en.wikipedia.org/wiki/Scalable_Vector_Graphics Wikipedia
       */
      XML_SVG_IMAGE: "image/svg+xml"
    });
    var _MIME_TYPES = Object.keys(MIME_TYPE).map(function(key2) {
      return MIME_TYPE[key2];
    });
    function isValidMimeType(mimeType) {
      return _MIME_TYPES.indexOf(mimeType) > -1;
    }
    var NAMESPACE = freeze({
      /**
       * The XHTML namespace.
       *
       * @see http://www.w3.org/1999/xhtml
       */
      HTML: "http://www.w3.org/1999/xhtml",
      /**
       * The SVG namespace.
       *
       * @see http://www.w3.org/2000/svg
       */
      SVG: "http://www.w3.org/2000/svg",
      /**
       * The `xml:` namespace.
       *
       * @see http://www.w3.org/XML/1998/namespace
       */
      XML: "http://www.w3.org/XML/1998/namespace",
      /**
       * The `xmlns:` namespace.
       *
       * @see https://www.w3.org/2000/xmlns/
       */
      XMLNS: "http://www.w3.org/2000/xmlns/"
    });
    exports2.assign = assign;
    exports2.find = find;
    exports2.freeze = freeze;
    exports2.HTML_BOOLEAN_ATTRIBUTES = HTML_BOOLEAN_ATTRIBUTES;
    exports2.HTML_RAW_TEXT_ELEMENTS = HTML_RAW_TEXT_ELEMENTS;
    exports2.HTML_VOID_ELEMENTS = HTML_VOID_ELEMENTS;
    exports2.hasDefaultHTMLNamespace = hasDefaultHTMLNamespace;
    exports2.hasOwn = hasOwn;
    exports2.isHTMLBooleanAttribute = isHTMLBooleanAttribute;
    exports2.isHTMLRawTextElement = isHTMLRawTextElement;
    exports2.isHTMLEscapableRawTextElement = isHTMLEscapableRawTextElement;
    exports2.isHTMLMimeType = isHTMLMimeType;
    exports2.isHTMLVoidElement = isHTMLVoidElement;
    exports2.isValidMimeType = isValidMimeType;
    exports2.MIME_TYPE = MIME_TYPE;
    exports2.NAMESPACE = NAMESPACE;
  }
});

// node_modules/@xmldom/xmldom/lib/errors.js
var require_errors = __commonJS({
  "node_modules/@xmldom/xmldom/lib/errors.js"(exports2) {
    "use strict";
    var conventions = require_conventions();
    function extendError(constructor, writableName) {
      constructor.prototype = Object.create(Error.prototype, {
        constructor: { value: constructor },
        name: { value: constructor.name, enumerable: true, writable: writableName }
      });
    }
    var DOMExceptionName = conventions.freeze({
      /**
       * the default value as defined by the spec
       */
      Error: "Error",
      /**
       * @deprecated
       * Use RangeError instead.
       */
      IndexSizeError: "IndexSizeError",
      /**
       * @deprecated
       * Just to match the related static code, not part of the spec.
       */
      DomstringSizeError: "DomstringSizeError",
      HierarchyRequestError: "HierarchyRequestError",
      WrongDocumentError: "WrongDocumentError",
      InvalidCharacterError: "InvalidCharacterError",
      /**
       * @deprecated
       * Just to match the related static code, not part of the spec.
       */
      NoDataAllowedError: "NoDataAllowedError",
      NoModificationAllowedError: "NoModificationAllowedError",
      NotFoundError: "NotFoundError",
      NotSupportedError: "NotSupportedError",
      InUseAttributeError: "InUseAttributeError",
      InvalidStateError: "InvalidStateError",
      SyntaxError: "SyntaxError",
      InvalidModificationError: "InvalidModificationError",
      NamespaceError: "NamespaceError",
      /**
       * @deprecated
       * Use TypeError for invalid arguments,
       * "NotSupportedError" DOMException for unsupported operations,
       * and "NotAllowedError" DOMException for denied requests instead.
       */
      InvalidAccessError: "InvalidAccessError",
      /**
       * @deprecated
       * Just to match the related static code, not part of the spec.
       */
      ValidationError: "ValidationError",
      /**
       * @deprecated
       * Use TypeError instead.
       */
      TypeMismatchError: "TypeMismatchError",
      SecurityError: "SecurityError",
      NetworkError: "NetworkError",
      AbortError: "AbortError",
      /**
       * @deprecated
       * Just to match the related static code, not part of the spec.
       */
      URLMismatchError: "URLMismatchError",
      QuotaExceededError: "QuotaExceededError",
      TimeoutError: "TimeoutError",
      InvalidNodeTypeError: "InvalidNodeTypeError",
      DataCloneError: "DataCloneError",
      EncodingError: "EncodingError",
      NotReadableError: "NotReadableError",
      UnknownError: "UnknownError",
      ConstraintError: "ConstraintError",
      DataError: "DataError",
      TransactionInactiveError: "TransactionInactiveError",
      ReadOnlyError: "ReadOnlyError",
      VersionError: "VersionError",
      OperationError: "OperationError",
      NotAllowedError: "NotAllowedError",
      OptOutError: "OptOutError"
    });
    var DOMExceptionNames = Object.keys(DOMExceptionName);
    function isValidDomExceptionCode(value) {
      return typeof value === "number" && value >= 1 && value <= 25;
    }
    function endsWithError(value) {
      return typeof value === "string" && value.substring(value.length - DOMExceptionName.Error.length) === DOMExceptionName.Error;
    }
    function DOMException(messageOrCode, nameOrMessage) {
      if (isValidDomExceptionCode(messageOrCode)) {
        this.name = DOMExceptionNames[messageOrCode];
        this.message = nameOrMessage || "";
      } else {
        this.message = messageOrCode;
        this.name = endsWithError(nameOrMessage) ? nameOrMessage : DOMExceptionName.Error;
      }
      if (Error.captureStackTrace) Error.captureStackTrace(this, DOMException);
    }
    extendError(DOMException, true);
    Object.defineProperties(DOMException.prototype, {
      code: {
        enumerable: true,
        get: function() {
          var code = DOMExceptionNames.indexOf(this.name);
          if (isValidDomExceptionCode(code)) return code;
          return 0;
        }
      }
    });
    var ExceptionCode = {
      INDEX_SIZE_ERR: 1,
      DOMSTRING_SIZE_ERR: 2,
      HIERARCHY_REQUEST_ERR: 3,
      WRONG_DOCUMENT_ERR: 4,
      INVALID_CHARACTER_ERR: 5,
      NO_DATA_ALLOWED_ERR: 6,
      NO_MODIFICATION_ALLOWED_ERR: 7,
      NOT_FOUND_ERR: 8,
      NOT_SUPPORTED_ERR: 9,
      INUSE_ATTRIBUTE_ERR: 10,
      INVALID_STATE_ERR: 11,
      SYNTAX_ERR: 12,
      INVALID_MODIFICATION_ERR: 13,
      NAMESPACE_ERR: 14,
      INVALID_ACCESS_ERR: 15,
      VALIDATION_ERR: 16,
      TYPE_MISMATCH_ERR: 17,
      SECURITY_ERR: 18,
      NETWORK_ERR: 19,
      ABORT_ERR: 20,
      URL_MISMATCH_ERR: 21,
      QUOTA_EXCEEDED_ERR: 22,
      TIMEOUT_ERR: 23,
      INVALID_NODE_TYPE_ERR: 24,
      DATA_CLONE_ERR: 25
    };
    var entries = Object.entries(ExceptionCode);
    for (i2 = 0; i2 < entries.length; i2++) {
      key2 = entries[i2][0];
      DOMException[key2] = entries[i2][1];
    }
    var key2;
    var i2;
    function ParseError(message, locator, cause) {
      this.message = message;
      this.locator = locator;
      this.cause = cause;
      if (Error.captureStackTrace) Error.captureStackTrace(this, ParseError);
    }
    extendError(ParseError);
    exports2.DOMException = DOMException;
    exports2.DOMExceptionName = DOMExceptionName;
    exports2.ExceptionCode = ExceptionCode;
    exports2.ParseError = ParseError;
  }
});

// node_modules/@xmldom/xmldom/lib/grammar.js
var require_grammar = __commonJS({
  "node_modules/@xmldom/xmldom/lib/grammar.js"(exports2) {
    "use strict";
    function detectUnicodeSupport(RegExpImpl) {
      try {
        if (typeof RegExpImpl !== "function") {
          RegExpImpl = RegExp;
        }
        var match = new RegExpImpl("\u{1D306}", "u").exec("\u{1D306}");
        return !!match && match[0].length === 2;
      } catch (error) {
      }
      return false;
    }
    var UNICODE_SUPPORT = detectUnicodeSupport();
    function chars(regexp) {
      if (regexp.source[0] !== "[") {
        throw new Error(regexp + " can not be used with chars");
      }
      return regexp.source.slice(1, regexp.source.lastIndexOf("]"));
    }
    function chars_without(regexp, search) {
      if (regexp.source[0] !== "[") {
        throw new Error("/" + regexp.source + "/ can not be used with chars_without");
      }
      if (!search || typeof search !== "string") {
        throw new Error(JSON.stringify(search) + " is not a valid search");
      }
      if (regexp.source.indexOf(search) === -1) {
        throw new Error('"' + search + '" is not is /' + regexp.source + "/");
      }
      if (search === "-" && regexp.source.indexOf(search) !== 1) {
        throw new Error('"' + search + '" is not at the first postion of /' + regexp.source + "/");
      }
      return new RegExp(regexp.source.replace(search, ""), UNICODE_SUPPORT ? "u" : "");
    }
    function reg(args) {
      var self = this;
      return new RegExp(
        Array.prototype.slice.call(arguments).map(function(part) {
          var isStr = typeof part === "string";
          if (isStr && self === void 0 && part === "|") {
            throw new Error("use regg instead of reg to wrap expressions with `|`!");
          }
          return isStr ? part : part.source;
        }).join(""),
        UNICODE_SUPPORT ? "u" : ""
      );
    }
    function regg(args) {
      if (arguments.length === 0) {
        throw new Error("no parameters provided");
      }
      return reg.apply(regg, ["(?:"].concat(Array.prototype.slice.call(arguments), [")"]));
    }
    var UNICODE_REPLACEMENT_CHARACTER = "\uFFFD";
    var Char = /[-\x09\x0A\x0D\x20-\x2C\x2E-\uD7FF\uE000-\uFFFD]/;
    if (UNICODE_SUPPORT) {
      Char = reg("[", chars(Char), "\\u{10000}-\\u{10FFFF}", "]");
    }
    var InvalidChar = new RegExp("[^" + chars(Char) + "]", UNICODE_SUPPORT ? "u" : "");
    var _SChar = /[\x20\x09\x0D\x0A]/;
    var SChar_s = chars(_SChar);
    var S = reg(_SChar, "+");
    var S_OPT = reg(_SChar, "*");
    var NameStartChar = /[:_a-zA-Z\xC0-\xD6\xD8-\xF6\xF8-\u02FF\u0370-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]/;
    if (UNICODE_SUPPORT) {
      NameStartChar = reg("[", chars(NameStartChar), "\\u{10000}-\\u{10FFFF}", "]");
    }
    var NameStartChar_s = chars(NameStartChar);
    var NameChar = reg("[", NameStartChar_s, chars(/[-.0-9\xB7]/), chars(/[\u0300-\u036F\u203F-\u2040]/), "]");
    var Name = reg(NameStartChar, NameChar, "*");
    var Name_exact = reg("^", Name, "$");
    var Nmtoken = reg(NameChar, "+");
    var EntityRef = reg("&", Name, ";");
    var CharRef = regg(/&#[0-9]+;|&#x[0-9a-fA-F]+;/);
    var Reference = regg(EntityRef, "|", CharRef);
    var PEReference = reg("%", Name, ";");
    var EntityValue = regg(
      reg('"', regg(/[^%&"]/, "|", PEReference, "|", Reference), "*", '"'),
      "|",
      reg("'", regg(/[^%&']/, "|", PEReference, "|", Reference), "*", "'")
    );
    var AttValue = regg('"', regg(/[^<&"]/, "|", Reference), "*", '"', "|", "'", regg(/[^<&']/, "|", Reference), "*", "'");
    var NCNameStartChar = chars_without(NameStartChar, ":");
    var NCNameChar = chars_without(NameChar, ":");
    var NCName = reg(NCNameStartChar, NCNameChar, "*");
    var NCName_exact = reg("^", NCName, "$");
    var QName = reg(NCName, regg(":", NCName), "?");
    var QName_exact = reg("^", QName, "$");
    var QName_group = reg("(", QName, ")");
    var SystemLiteral = regg(/"[^"]*"|'[^']*'/);
    var PI = reg(/^<\?/, "(", Name, ")", regg(S, "(?!", _SChar, ")(", Char, "*?)"), "?", /\?>/);
    var PubidChar = /[\x20\x0D\x0Aa-zA-Z0-9-'()+,./:=?;!*#@$_%]/;
    var PubidLiteral = regg('"', PubidChar, '*"', "|", "'", chars_without(PubidChar, "'"), "*'");
    var COMMENT_START = "<!--";
    var COMMENT_END = "-->";
    var Comment = reg(COMMENT_START, regg(chars_without(Char, "-"), "|", reg("-", chars_without(Char, "-"))), "*", COMMENT_END);
    var PCDATA = "#PCDATA";
    var Mixed = regg(
      reg(/\(/, S_OPT, PCDATA, regg(S_OPT, /\|/, S_OPT, QName), "*", S_OPT, /\)\*/),
      "|",
      reg(/\(/, S_OPT, PCDATA, S_OPT, /\)/)
    );
    var _children_quantity = /[?*+]?/;
    var children2 = reg(
      /\([^>]+\)/,
      _children_quantity
      /*regg(choice, '|', seq), _children_quantity*/
    );
    var contentspec = regg("EMPTY", "|", "ANY", "|", Mixed, "|", children2);
    var ELEMENTDECL_START = "<!ELEMENT";
    var elementdecl = reg(ELEMENTDECL_START, S, regg(QName, "|", PEReference), S, regg(contentspec, "|", PEReference), S_OPT, ">");
    var NotationType = reg("NOTATION", S, /\(/, S_OPT, Name, regg(S_OPT, /\|/, S_OPT, Name), "*", S_OPT, /\)/);
    var Enumeration = reg(/\(/, S_OPT, Nmtoken, regg(S_OPT, /\|/, S_OPT, Nmtoken), "*", S_OPT, /\)/);
    var EnumeratedType = regg(NotationType, "|", Enumeration);
    var AttType = regg(/CDATA|ID|IDREF|IDREFS|ENTITY|ENTITIES|NMTOKEN|NMTOKENS/, "|", EnumeratedType);
    var DefaultDecl = regg(/#REQUIRED|#IMPLIED/, "|", regg(regg("#FIXED", S), "?", AttValue));
    var AttDef = regg(S, Name, S, AttType, S, DefaultDecl);
    var ATTLIST_DECL_START = "<!ATTLIST";
    var AttlistDecl = reg(ATTLIST_DECL_START, S, Name, AttDef, "*", S_OPT, ">");
    var ABOUT_LEGACY_COMPAT = "about:legacy-compat";
    var ABOUT_LEGACY_COMPAT_SystemLiteral = regg('"' + ABOUT_LEGACY_COMPAT + '"', "|", "'" + ABOUT_LEGACY_COMPAT + "'");
    var SYSTEM = "SYSTEM";
    var PUBLIC = "PUBLIC";
    var ExternalID = regg(regg(SYSTEM, S, SystemLiteral), "|", regg(PUBLIC, S, PubidLiteral, S, SystemLiteral));
    var ExternalID_match = reg(
      "^",
      regg(
        regg(SYSTEM, S, "(?<SystemLiteralOnly>", SystemLiteral, ")"),
        "|",
        regg(PUBLIC, S, "(?<PubidLiteral>", PubidLiteral, ")", S, "(?<SystemLiteral>", SystemLiteral, ")")
      )
    );
    var PubidLiteral_match = reg("^", PubidLiteral, "$");
    var SystemLiteral_match = reg("^", SystemLiteral, "$");
    var NDataDecl = regg(S, "NDATA", S, Name);
    var EntityDef = regg(EntityValue, "|", regg(ExternalID, NDataDecl, "?"));
    var ENTITY_DECL_START = "<!ENTITY";
    var GEDecl = reg(ENTITY_DECL_START, S, Name, S, EntityDef, S_OPT, ">");
    var PEDef = regg(EntityValue, "|", ExternalID);
    var PEDecl = reg(ENTITY_DECL_START, S, "%", S, Name, S, PEDef, S_OPT, ">");
    var EntityDecl = regg(GEDecl, "|", PEDecl);
    var PublicID = reg(PUBLIC, S, PubidLiteral);
    var NotationDecl = reg("<!NOTATION", S, Name, S, regg(ExternalID, "|", PublicID), S_OPT, ">");
    var Eq = reg(S_OPT, "=", S_OPT);
    var VersionNum = /1[.]\d+/;
    var VersionInfo = reg(S, "version", Eq, regg("'", VersionNum, "'", "|", '"', VersionNum, '"'));
    var EncName = /[A-Za-z][-A-Za-z0-9._]*/;
    var EncodingDecl = regg(S, "encoding", Eq, regg('"', EncName, '"', "|", "'", EncName, "'"));
    var SDDecl = regg(S, "standalone", Eq, regg("'", regg("yes", "|", "no"), "'", "|", '"', regg("yes", "|", "no"), '"'));
    var XMLDecl = reg(/^<\?xml/, VersionInfo, EncodingDecl, "?", SDDecl, "?", S_OPT, /\?>/);
    var DOCTYPE_DECL_START = "<!DOCTYPE";
    var CDATA_START = "<![CDATA[";
    var CDATA_END = "]]>";
    var CDStart = /<!\[CDATA\[/;
    var CDEnd = /\]\]>/;
    var CData = reg(Char, "*?", CDEnd);
    var CDSect = reg(CDStart, CData);
    exports2.chars = chars;
    exports2.chars_without = chars_without;
    exports2.detectUnicodeSupport = detectUnicodeSupport;
    exports2.reg = reg;
    exports2.regg = regg;
    exports2.ABOUT_LEGACY_COMPAT = ABOUT_LEGACY_COMPAT;
    exports2.ABOUT_LEGACY_COMPAT_SystemLiteral = ABOUT_LEGACY_COMPAT_SystemLiteral;
    exports2.AttlistDecl = AttlistDecl;
    exports2.CDATA_START = CDATA_START;
    exports2.CDATA_END = CDATA_END;
    exports2.CDSect = CDSect;
    exports2.Char = Char;
    exports2.Comment = Comment;
    exports2.COMMENT_START = COMMENT_START;
    exports2.COMMENT_END = COMMENT_END;
    exports2.DOCTYPE_DECL_START = DOCTYPE_DECL_START;
    exports2.elementdecl = elementdecl;
    exports2.EntityDecl = EntityDecl;
    exports2.EntityValue = EntityValue;
    exports2.ExternalID = ExternalID;
    exports2.ExternalID_match = ExternalID_match;
    exports2.Name = Name;
    exports2.Name_exact = Name_exact;
    exports2.NCName_exact = NCName_exact;
    exports2.NotationDecl = NotationDecl;
    exports2.Reference = Reference;
    exports2.PEReference = PEReference;
    exports2.PI = PI;
    exports2.PUBLIC = PUBLIC;
    exports2.PubidLiteral = PubidLiteral;
    exports2.PubidLiteral_match = PubidLiteral_match;
    exports2.QName = QName;
    exports2.QName_exact = QName_exact;
    exports2.QName_group = QName_group;
    exports2.S = S;
    exports2.SChar_s = SChar_s;
    exports2.S_OPT = S_OPT;
    exports2.SYSTEM = SYSTEM;
    exports2.SystemLiteral = SystemLiteral;
    exports2.SystemLiteral_match = SystemLiteral_match;
    exports2.InvalidChar = InvalidChar;
    exports2.UNICODE_REPLACEMENT_CHARACTER = UNICODE_REPLACEMENT_CHARACTER;
    exports2.UNICODE_SUPPORT = UNICODE_SUPPORT;
    exports2.XMLDecl = XMLDecl;
  }
});

// node_modules/@xmldom/xmldom/lib/dom.js
var require_dom = __commonJS({
  "node_modules/@xmldom/xmldom/lib/dom.js"(exports2) {
    "use strict";
    var conventions = require_conventions();
    var find = conventions.find;
    var hasDefaultHTMLNamespace = conventions.hasDefaultHTMLNamespace;
    var hasOwn = conventions.hasOwn;
    var isHTMLMimeType = conventions.isHTMLMimeType;
    var isHTMLRawTextElement = conventions.isHTMLRawTextElement;
    var isHTMLVoidElement = conventions.isHTMLVoidElement;
    var MIME_TYPE = conventions.MIME_TYPE;
    var NAMESPACE = conventions.NAMESPACE;
    var PDC = Symbol();
    var errors = require_errors();
    var DOMException = errors.DOMException;
    var DOMExceptionName = errors.DOMExceptionName;
    var g = require_grammar();
    function checkSymbol(symbol) {
      if (symbol !== PDC) {
        throw new TypeError("Illegal constructor");
      }
    }
    function notEmptyString(input) {
      return input !== "";
    }
    function splitOnASCIIWhitespace(input) {
      return input ? input.split(/[\t\n\f\r ]+/).filter(notEmptyString) : [];
    }
    function orderedSetReducer(current, element) {
      if (!hasOwn(current, element)) {
        current[element] = true;
      }
      return current;
    }
    function toOrderedSet(input) {
      if (!input) return [];
      var list = splitOnASCIIWhitespace(input);
      return Object.keys(list.reduce(orderedSetReducer, {}));
    }
    function arrayIncludes(list) {
      return function(element) {
        return list && list.indexOf(element) !== -1;
      };
    }
    function validateQualifiedName(qualifiedName) {
      if (!g.QName_exact.test(qualifiedName)) {
        throw new DOMException(DOMException.INVALID_CHARACTER_ERR, 'invalid character in qualified name "' + qualifiedName + '"');
      }
    }
    function validateAndExtract(namespace, qualifiedName) {
      validateQualifiedName(qualifiedName);
      namespace = namespace || null;
      var prefix = null;
      var localName = qualifiedName;
      if (qualifiedName.indexOf(":") >= 0) {
        var splitResult = qualifiedName.split(":");
        prefix = splitResult[0];
        localName = splitResult[1];
      }
      if (prefix !== null && namespace === null) {
        throw new DOMException(DOMException.NAMESPACE_ERR, "prefix is non-null and namespace is null");
      }
      if (prefix === "xml" && namespace !== conventions.NAMESPACE.XML) {
        throw new DOMException(DOMException.NAMESPACE_ERR, 'prefix is "xml" and namespace is not the XML namespace');
      }
      if ((prefix === "xmlns" || qualifiedName === "xmlns") && namespace !== conventions.NAMESPACE.XMLNS) {
        throw new DOMException(
          DOMException.NAMESPACE_ERR,
          'either qualifiedName or prefix is "xmlns" and namespace is not the XMLNS namespace'
        );
      }
      if (namespace === conventions.NAMESPACE.XMLNS && prefix !== "xmlns" && qualifiedName !== "xmlns") {
        throw new DOMException(
          DOMException.NAMESPACE_ERR,
          'namespace is the XMLNS namespace and neither qualifiedName nor prefix is "xmlns"'
        );
      }
      return [namespace, prefix, localName];
    }
    function copy(src, dest) {
      for (var p in src) {
        if (hasOwn(src, p)) {
          dest[p] = src[p];
        }
      }
    }
    function _extends(Class, Super) {
      var pt = Class.prototype;
      if (!(pt instanceof Super)) {
        let t = function() {
        };
        t.prototype = Super.prototype;
        t = new t();
        copy(pt, t);
        Class.prototype = pt = t;
      }
      if (pt.constructor != Class) {
        if (typeof Class != "function") {
          console.error("unknown Class:" + Class);
        }
        pt.constructor = Class;
      }
    }
    var NodeType = {};
    var ELEMENT_NODE = NodeType.ELEMENT_NODE = 1;
    var ATTRIBUTE_NODE = NodeType.ATTRIBUTE_NODE = 2;
    var TEXT_NODE = NodeType.TEXT_NODE = 3;
    var CDATA_SECTION_NODE = NodeType.CDATA_SECTION_NODE = 4;
    var ENTITY_REFERENCE_NODE = NodeType.ENTITY_REFERENCE_NODE = 5;
    var ENTITY_NODE = NodeType.ENTITY_NODE = 6;
    var PROCESSING_INSTRUCTION_NODE = NodeType.PROCESSING_INSTRUCTION_NODE = 7;
    var COMMENT_NODE = NodeType.COMMENT_NODE = 8;
    var DOCUMENT_NODE = NodeType.DOCUMENT_NODE = 9;
    var DOCUMENT_TYPE_NODE = NodeType.DOCUMENT_TYPE_NODE = 10;
    var DOCUMENT_FRAGMENT_NODE = NodeType.DOCUMENT_FRAGMENT_NODE = 11;
    var NOTATION_NODE = NodeType.NOTATION_NODE = 12;
    var DocumentPosition = conventions.freeze({
      DOCUMENT_POSITION_DISCONNECTED: 1,
      DOCUMENT_POSITION_PRECEDING: 2,
      DOCUMENT_POSITION_FOLLOWING: 4,
      DOCUMENT_POSITION_CONTAINS: 8,
      DOCUMENT_POSITION_CONTAINED_BY: 16,
      DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC: 32
    });
    function commonAncestor(a, b) {
      if (b.length < a.length) return commonAncestor(b, a);
      var c = null;
      for (var n in a) {
        if (a[n] !== b[n]) return c;
        c = a[n];
      }
      return c;
    }
    function docGUID(doc) {
      if (!doc.guid) doc.guid = Math.random();
      return doc.guid;
    }
    function NodeList() {
    }
    NodeList.prototype = {
      /**
       * The number of nodes in the list. The range of valid child node indices is 0 to length-1
       * inclusive.
       *
       * @type {number}
       */
      length: 0,
      /**
       * Returns the item at `index`. If index is greater than or equal to the number of nodes in
       * the list, this returns null.
       *
       * @param index
       * Unsigned long Index into the collection.
       * @returns {Node | null}
       * The node at position `index` in the NodeList,
       * or null if that is not a valid index.
       */
      item: function(index) {
        return index >= 0 && index < this.length ? this[index] : null;
      },
      /**
       * Returns a string representation of the NodeList.
       *
       * Accepts the same `options` object as `XMLSerializer.prototype.serializeToString`
       * (`requireWellFormed`, `splitCDATASections`, `nodeFilter`). Passing a function is treated as
       * a legacy `nodeFilter` for backward compatibility.
       *
       * @param {Object | function} [options]
       * @param {boolean} [options.requireWellFormed=false]
       * @param {boolean} [options.splitCDATASections=true]
       * @param {function} [options.nodeFilter]
       * @returns {string}
       */
      toString: function(options) {
        var opts;
        if (typeof options === "function") {
          opts = { requireWellFormed: false, splitCDATASections: true, nodeFilter: options };
        } else if (!!options) {
          opts = {
            requireWellFormed: !!options.requireWellFormed,
            splitCDATASections: options.splitCDATASections !== false,
            nodeFilter: options.nodeFilter || null
          };
        } else {
          opts = { requireWellFormed: false, splitCDATASections: true, nodeFilter: null };
        }
        for (var buf = [], i2 = 0; i2 < this.length; i2++) {
          serializeToString(this[i2], buf, null, opts);
        }
        return buf.join("");
      },
      /**
       * Filters the NodeList based on a predicate.
       *
       * @param {function(Node): boolean} predicate
       * - A predicate function to filter the NodeList.
       * @returns {Node[]}
       * An array of nodes that satisfy the predicate.
       * @private
       */
      filter: function(predicate) {
        return Array.prototype.filter.call(this, predicate);
      },
      /**
       * Returns the first index at which a given node can be found in the NodeList, or -1 if it is
       * not present.
       *
       * @param {Node} item
       * - The Node item to locate in the NodeList.
       * @returns {number}
       * The first index of the node in the NodeList; -1 if not found.
       * @private
       */
      indexOf: function(item) {
        return Array.prototype.indexOf.call(this, item);
      }
    };
    NodeList.prototype[Symbol.iterator] = function() {
      var me = this;
      var index = 0;
      return {
        next: function() {
          if (index < me.length) {
            return {
              value: me[index++],
              done: false
            };
          } else {
            return {
              done: true
            };
          }
        },
        return: function() {
          return {
            done: true
          };
        }
      };
    };
    function LiveNodeList(node, refresh) {
      this._node = node;
      this._refresh = refresh;
      _updateLiveList(this);
    }
    function _updateLiveList(list) {
      var inc = list._node._inc || list._node.ownerDocument._inc;
      if (list._inc !== inc) {
        var ls = list._refresh(list._node);
        __set__(list, "length", ls.length);
        if (!list.$$length || ls.length < list.$$length) {
          for (var i2 = ls.length; i2 in list; i2++) {
            if (hasOwn(list, i2)) {
              delete list[i2];
            }
          }
        }
        copy(ls, list);
        list._inc = inc;
      }
    }
    LiveNodeList.prototype.item = function(i2) {
      _updateLiveList(this);
      return this[i2] || null;
    };
    _extends(LiveNodeList, NodeList);
    function NamedNodeMap() {
      this._nsIndex = /* @__PURE__ */ Object.create(null);
      this._noNsIndex = /* @__PURE__ */ Object.create(null);
    }
    function _findNodeIndex(list, node) {
      var i2 = 0;
      while (i2 < list.length) {
        if (list[i2] === node) {
          return i2;
        }
        i2++;
      }
    }
    function _nnmBucket(map, namespaceURI, create) {
      if (!namespaceURI) {
        return map._noNsIndex;
      }
      var bucket = map._nsIndex[namespaceURI];
      if (!bucket && create) {
        bucket = map._nsIndex[namespaceURI] = /* @__PURE__ */ Object.create(null);
      }
      return bucket;
    }
    function _nnmIndexFind(map, namespaceURI, localName) {
      var bucket = _nnmBucket(map, namespaceURI, false);
      var found = bucket && bucket[localName];
      return found ? found : null;
    }
    function _nnmIndexAdd(map, attr) {
      _nnmBucket(map, attr.namespaceURI, true)[attr.localName] = attr;
    }
    function _nnmIndexRemove(map, attr) {
      var bucket = _nnmBucket(map, attr.namespaceURI, false);
      if (bucket) {
        delete bucket[attr.localName];
      }
    }
    function _addNamedNode(el, list, newAttr, oldAttr) {
      if (oldAttr) {
        list[_findNodeIndex(list, oldAttr)] = newAttr;
      } else {
        list[list.length] = newAttr;
        list.length++;
      }
      _nnmIndexAdd(list, newAttr);
      if (el) {
        newAttr.ownerElement = el;
        var doc = el.ownerDocument;
        if (doc) {
          oldAttr && _onRemoveAttribute(doc, el, oldAttr);
          _onAddAttribute(doc, el, newAttr);
        }
      }
    }
    function _removeNamedNode(el, list, attr) {
      var i2 = _findNodeIndex(list, attr);
      if (i2 >= 0) {
        var lastIndex = list.length - 1;
        while (i2 <= lastIndex) {
          list[i2] = list[++i2];
        }
        list.length = lastIndex;
        _nnmIndexRemove(list, attr);
        if (el) {
          var doc = el.ownerDocument;
          if (doc) {
            _onRemoveAttribute(doc, el, attr);
          }
          attr.ownerElement = null;
        }
      }
    }
    NamedNodeMap.prototype = {
      length: 0,
      item: NodeList.prototype.item,
      /**
       * Get an attribute by name. Note: Name is in lower case in case of HTML namespace and
       * document.
       *
       * @param {string} localName
       * The local name of the attribute.
       * @returns {Attr | null}
       * The attribute with the given local name, or null if no such attribute exists.
       * @see https://dom.spec.whatwg.org/#concept-element-attributes-get-by-name
       */
      getNamedItem: function(localName) {
        if (this._ownerElement && this._ownerElement._isInHTMLDocumentAndNamespace()) {
          localName = localName.toLowerCase();
        }
        var i2 = 0;
        while (i2 < this.length) {
          var attr = this[i2];
          if (attr.nodeName === localName) {
            return attr;
          }
          i2++;
        }
        return null;
      },
      /**
       * Set an attribute.
       *
       * @param {Attr} attr
       * The attribute to set.
       * @returns {Attr | null}
       * The old attribute with the same local name and namespace URI as the new one, or null if no
       * such attribute exists.
       * @throws {DOMException}
       * With code:
       * - {@link INUSE_ATTRIBUTE_ERR} - If the attribute is already an attribute of another
       * element.
       * @see https://dom.spec.whatwg.org/#concept-element-attributes-set
       */
      setNamedItem: function(attr) {
        var el = attr.ownerElement;
        if (el && el !== this._ownerElement) {
          throw new DOMException(DOMException.INUSE_ATTRIBUTE_ERR);
        }
        var oldAttr = _nnmIndexFind(this, attr.namespaceURI, attr.localName);
        if (oldAttr === attr) {
          return attr;
        }
        _addNamedNode(this._ownerElement, this, attr, oldAttr);
        return oldAttr;
      },
      /**
       * Set an attribute, replacing an existing attribute with the same local name and namespace
       * URI if one exists.
       *
       * @param {Attr} attr
       * The attribute to set.
       * @returns {Attr | null}
       * The old attribute with the same local name and namespace URI as the new one, or null if no
       * such attribute exists.
       * @throws {DOMException}
       * Throws a DOMException with the name "InUseAttributeError" if the attribute is already an
       * attribute of another element.
       * @see https://dom.spec.whatwg.org/#concept-element-attributes-set
       */
      setNamedItemNS: function(attr) {
        return this.setNamedItem(attr);
      },
      /**
       * Removes an attribute specified by the local name.
       *
       * @param {string} localName
       * The local name of the attribute to be removed.
       * @returns {Attr}
       * The attribute node that was removed.
       * @throws {DOMException}
       * With code:
       * - {@link DOMException.NOT_FOUND_ERR} if no attribute with the given name is found.
       * @see https://dom.spec.whatwg.org/#dom-namednodemap-removenameditem
       * @see https://dom.spec.whatwg.org/#concept-element-attributes-remove-by-name
       */
      removeNamedItem: function(localName) {
        var attr = this.getNamedItem(localName);
        if (!attr) {
          throw new DOMException(DOMException.NOT_FOUND_ERR, localName);
        }
        _removeNamedNode(this._ownerElement, this, attr);
        return attr;
      },
      /**
       * Removes an attribute specified by the namespace and local name.
       *
       * @param {string | null} namespaceURI
       * The namespace URI of the attribute to be removed.
       * @param {string} localName
       * The local name of the attribute to be removed.
       * @returns {Attr}
       * The attribute node that was removed.
       * @throws {DOMException}
       * With code:
       * - {@link DOMException.NOT_FOUND_ERR} if no attribute with the given namespace URI and local
       * name is found.
       * @see https://dom.spec.whatwg.org/#dom-namednodemap-removenameditemns
       * @see https://dom.spec.whatwg.org/#concept-element-attributes-remove-by-namespace
       */
      removeNamedItemNS: function(namespaceURI, localName) {
        var attr = this.getNamedItemNS(namespaceURI, localName);
        if (!attr) {
          throw new DOMException(DOMException.NOT_FOUND_ERR, namespaceURI ? namespaceURI + " : " + localName : localName);
        }
        _removeNamedNode(this._ownerElement, this, attr);
        return attr;
      },
      /**
       * Get an attribute by namespace and local name.
       *
       * @param {string | null} namespaceURI
       * The namespace URI of the attribute.
       * @param {string} localName
       * The local name of the attribute.
       * @returns {Attr | null}
       * The attribute with the given namespace URI and local name, or null if no such attribute
       * exists.
       * @see https://dom.spec.whatwg.org/#concept-element-attributes-get-by-namespace
       */
      getNamedItemNS: function(namespaceURI, localName) {
        if (!namespaceURI) {
          namespaceURI = null;
        }
        var i2 = 0;
        while (i2 < this.length) {
          var node = this[i2];
          if (node.localName === localName && node.namespaceURI === namespaceURI) {
            return node;
          }
          i2++;
        }
        return null;
      }
    };
    NamedNodeMap.prototype[Symbol.iterator] = function() {
      var me = this;
      var index = 0;
      return {
        next: function() {
          if (index < me.length) {
            return {
              value: me[index++],
              done: false
            };
          } else {
            return {
              done: true
            };
          }
        },
        return: function() {
          return {
            done: true
          };
        }
      };
    };
    function DOMImplementation() {
    }
    DOMImplementation.prototype = {
      /**
       * Test if the DOM implementation implements a specific feature and version, as specified in
       * {@link https://www.w3.org/TR/DOM-Level-3-Core/core.html#DOMFeatures DOM Features}.
       *
       * The DOMImplementation.hasFeature() method returns a Boolean flag indicating if a given
       * feature is supported. The different implementations fairly diverged in what kind of
       * features were reported. The latest version of the spec settled to force this method to
       * always return true, where the functionality was accurate and in use.
       *
       * @deprecated
       * It is deprecated and modern browsers return true in all cases.
       * @function DOMImplementation#hasFeature
       * @param {string} feature
       * The name of the feature to test.
       * @param {string} [version]
       * This is the version number of the feature to test.
       * @returns {boolean}
       * Always returns true.
       * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMImplementation/hasFeature MDN
       * @see https://www.w3.org/TR/REC-DOM-Level-1/level-one-core.html#ID-5CED94D7 DOM Level 1 Core
       * @see https://dom.spec.whatwg.org/#dom-domimplementation-hasfeature DOM Living Standard
       * @see https://www.w3.org/TR/DOM-Level-3-Core/core.html#ID-5CED94D7 DOM Level 3 Core
       */
      hasFeature: function(feature, version) {
        return true;
      },
      /**
       * Creates a DOM Document object of the specified type with its document element. Note that
       * based on the {@link DocumentType}
       * given to create the document, the implementation may instantiate specialized
       * {@link Document} objects that support additional features than the "Core", such as "HTML"
       * {@link https://www.w3.org/TR/DOM-Level-3-Core/references.html#DOM2HTML DOM Level 2 HTML}.
       * On the other hand, setting the {@link DocumentType} after the document was created makes
       * this very unlikely to happen. Alternatively, specialized {@link Document} creation methods,
       * such as createHTMLDocument
       * {@link https://www.w3.org/TR/DOM-Level-3-Core/references.html#DOM2HTML DOM Level 2 HTML},
       * can be used to obtain specific types of {@link Document} objects.
       *
       * __It behaves slightly different from the description in the living standard__:
       * - There is no interface/class `XMLDocument`, it returns a `Document`
       * instance (with it's `type` set to `'xml'`).
       * - `encoding`, `mode`, `origin`, `url` fields are currently not declared.
       *
       * @function DOMImplementation.createDocument
       * @param {string | null} namespaceURI
       * The
       * {@link https://www.w3.org/TR/DOM-Level-3-Core/glossary.html#dt-namespaceURI namespace URI}
       * of the document element to create or null.
       * @param {string | null} qualifiedName
       * The
       * {@link https://www.w3.org/TR/DOM-Level-3-Core/glossary.html#dt-qualifiedname qualified name}
       * of the document element to be created or null.
       * @param {DocumentType | null} [doctype=null]
       * The type of document to be created or null. When doctype is not null, its
       * {@link Node#ownerDocument} attribute is set to the document being created. Default is
       * `null`
       * @returns {Document}
       * A new {@link Document} object with its document element. If the NamespaceURI,
       * qualifiedName, and doctype are null, the returned {@link Document} is empty with no
       * document element.
       * @throws {DOMException}
       * With code:
       *
       * - `INVALID_CHARACTER_ERR`: Raised if the specified qualified name is not an XML name
       * according to {@link https://www.w3.org/TR/DOM-Level-3-Core/references.html#XML XML 1.0}.
       * - `NAMESPACE_ERR`: Raised if the qualifiedName is malformed, if the qualifiedName has a
       * prefix and the namespaceURI is null, or if the qualifiedName is null and the namespaceURI
       * is different from null, or if the qualifiedName has a prefix that is "xml" and the
       * namespaceURI is different from "{@link http://www.w3.org/XML/1998/namespace}"
       * {@link https://www.w3.org/TR/DOM-Level-3-Core/references.html#Namespaces XML Namespaces},
       * or if the DOM implementation does not support the "XML" feature but a non-null namespace
       * URI was provided, since namespaces were defined by XML.
       * - `WRONG_DOCUMENT_ERR`: Raised if doctype has already been used with a different document
       * or was created from a different implementation.
       * - `NOT_SUPPORTED_ERR`: May be raised if the implementation does not support the feature
       * "XML" and the language exposed through the Document does not support XML Namespaces (such
       * as {@link https://www.w3.org/TR/DOM-Level-3-Core/references.html#HTML40 HTML 4.01}).
       * @since DOM Level 2.
       * @see {@link #createHTMLDocument}
       * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMImplementation/createDocument MDN
       * @see https://dom.spec.whatwg.org/#dom-domimplementation-createdocument DOM Living Standard
       * @see https://www.w3.org/TR/DOM-Level-3-Core/core.html#Level-2-Core-DOM-createDocument DOM
       *      Level 3 Core
       * @see https://www.w3.org/TR/DOM-Level-2-Core/core.html#Level-2-Core-DOM-createDocument DOM
       *      Level 2 Core (initial)
       */
      createDocument: function(namespaceURI, qualifiedName, doctype) {
        var contentType = MIME_TYPE.XML_APPLICATION;
        if (namespaceURI === NAMESPACE.HTML) {
          contentType = MIME_TYPE.XML_XHTML_APPLICATION;
        } else if (namespaceURI === NAMESPACE.SVG) {
          contentType = MIME_TYPE.XML_SVG_IMAGE;
        }
        var doc = new Document(PDC, { contentType });
        doc.implementation = this;
        doc.childNodes = new NodeList();
        doc.doctype = doctype || null;
        if (doctype) {
          doc.appendChild(doctype);
        }
        if (qualifiedName) {
          var root = doc.createElementNS(namespaceURI, qualifiedName);
          doc.appendChild(root);
        }
        return doc;
      },
      /**
       * Creates an empty DocumentType node. Entity declarations and notations are not made
       * available. Entity reference expansions and default attribute additions do not occur.
       *
       * **This behavior is slightly different from the one in the specs**:
       * - `encoding`, `mode`, `origin`, `url` fields are currently not declared.
       * - `publicId` and `systemId` contain the raw data including any possible quotes,
       *   so they can always be serialized back to the original value
       * - `internalSubset` contains the raw string between `[` and `]` if present,
       *   but is not parsed or validated in any form.
       *
       * @function DOMImplementation#createDocumentType
       * @param {string} qualifiedName
       * The {@link https://www.w3.org/TR/DOM-Level-3-Core/glossary.html#dt-qualifiedname qualified
       * name} of the document type to be created.
       * @param {string} [publicId]
       * The external subset public identifier. Stored verbatim including surrounding quotes.
       * When serialized with `requireWellFormed: true`, the serializer throws `InvalidStateError`
       * if the value is non-empty and does not match the XML `PubidLiteral` production
       * (W3C DOM Parsing §3.2.1.3; XML 1.0 production [12]). Creation-time validation is not
       * enforced — deferred to a future breaking release.
       * @param {string} [systemId]
       * The external subset system identifier. Stored verbatim including surrounding quotes.
       * When serialized with `requireWellFormed: true`, the serializer throws `InvalidStateError`
       * if the value is non-empty and does not match the XML `SystemLiteral` production
       * (W3C DOM Parsing §3.2.1.3; XML 1.0 production [11]). Creation-time validation is not
       * enforced — deferred to a future breaking release.
       * @param {string} [internalSubset]
       * The internal subset or an empty string if it is not present. Stored verbatim.
       * When serialized with `requireWellFormed: true`, the serializer throws `InvalidStateError`
       * if the value contains `"]>"`. Creation-time validation is not enforced.
       * @returns {DocumentType}
       * A new {@link DocumentType} node with {@link Node#ownerDocument} set to null.
       * @throws {DOMException}
       * With code:
       *
       * - `INVALID_CHARACTER_ERR`: Raised if the specified qualified name is not an XML name
       * according to {@link https://www.w3.org/TR/DOM-Level-3-Core/references.html#XML XML 1.0}.
       * - `NAMESPACE_ERR`: Raised if the qualifiedName is malformed.
       * - `NOT_SUPPORTED_ERR`: May be raised if the implementation does not support the feature
       * "XML" and the language exposed through the Document does not support XML Namespaces (such
       * as {@link https://www.w3.org/TR/DOM-Level-3-Core/references.html#HTML40 HTML 4.01}).
       * @since DOM Level 2.
       * @see https://developer.mozilla.org/en-US/docs/Web/API/DOMImplementation/createDocumentType
       *      MDN
       * @see https://dom.spec.whatwg.org/#dom-domimplementation-createdocumenttype DOM Living
       *      Standard
       * @see https://www.w3.org/TR/DOM-Level-3-Core/core.html#Level-3-Core-DOM-createDocType DOM
       *      Level 3 Core
       * @see https://www.w3.org/TR/DOM-Level-2-Core/core.html#Level-2-Core-DOM-createDocType DOM
       *      Level 2 Core
       * @see https://github.com/xmldom/xmldom/blob/master/CHANGELOG.md#050
       * @see https://www.w3.org/TR/DOM-Level-2-Core/#core-ID-Core-DocType-internalSubset
       * @prettierignore
       */
      createDocumentType: function(qualifiedName, publicId, systemId, internalSubset) {
        validateQualifiedName(qualifiedName);
        var node = new DocumentType(PDC);
        node.name = qualifiedName;
        node.nodeName = qualifiedName;
        node.publicId = publicId || "";
        node.systemId = systemId || "";
        node.internalSubset = internalSubset || "";
        node.childNodes = new NodeList();
        return node;
      },
      /**
       * Returns an HTML document, that might already have a basic DOM structure.
       *
       * __It behaves slightly different from the description in the living standard__:
       * - If the first argument is `false` no initial nodes are added (steps 3-7 in the specs are
       * omitted)
       * - `encoding`, `mode`, `origin`, `url` fields are currently not declared.
       *
       * @param {string | false} [title]
       * A string containing the title to give the new HTML document.
       * @returns {Document}
       * The HTML document.
       * @since WHATWG Living Standard.
       * @see {@link #createDocument}
       * @see https://dom.spec.whatwg.org/#dom-domimplementation-createhtmldocument
       * @see https://dom.spec.whatwg.org/#html-document
       */
      createHTMLDocument: function(title) {
        var doc = new Document(PDC, { contentType: MIME_TYPE.HTML });
        doc.implementation = this;
        doc.childNodes = new NodeList();
        if (title !== false) {
          doc.doctype = this.createDocumentType("html");
          doc.doctype.ownerDocument = doc;
          doc.appendChild(doc.doctype);
          var htmlNode = doc.createElement("html");
          doc.appendChild(htmlNode);
          var headNode = doc.createElement("head");
          htmlNode.appendChild(headNode);
          if (typeof title === "string") {
            var titleNode = doc.createElement("title");
            titleNode.appendChild(doc.createTextNode(title));
            headNode.appendChild(titleNode);
          }
          htmlNode.appendChild(doc.createElement("body"));
        }
        return doc;
      }
    };
    function Node(symbol) {
      checkSymbol(symbol);
    }
    Node.prototype = {
      /**
       * The first child of this node.
       *
       * @type {Node | null}
       */
      firstChild: null,
      /**
       * The last child of this node.
       *
       * @type {Node | null}
       */
      lastChild: null,
      /**
       * The previous sibling of this node.
       *
       * @type {Node | null}
       */
      previousSibling: null,
      /**
       * The next sibling of this node.
       *
       * @type {Node | null}
       */
      nextSibling: null,
      /**
       * The parent node of this node.
       *
       * @type {Node | null}
       */
      parentNode: null,
      /**
       * The parent element of this node.
       *
       * @type {Element | null}
       */
      get parentElement() {
        return this.parentNode && this.parentNode.nodeType === this.ELEMENT_NODE ? this.parentNode : null;
      },
      /**
       * The child nodes of this node.
       *
       * @type {NodeList}
       */
      childNodes: null,
      /**
       * The document object associated with this node.
       *
       * @type {Document | null}
       */
      ownerDocument: null,
      /**
       * The value of this node.
       *
       * @type {string | null}
       */
      nodeValue: null,
      /**
       * The namespace URI of this node.
       *
       * @type {string | null}
       */
      namespaceURI: null,
      /**
       * The prefix of the namespace for this node.
       *
       * @type {string | null}
       */
      prefix: null,
      /**
       * The local part of the qualified name of this node.
       *
       * @type {string | null}
       */
      localName: null,
      /**
       * The baseURI is currently always `about:blank`,
       * since that's what happens when you create a document from scratch.
       *
       * @type {'about:blank'}
       */
      baseURI: "about:blank",
      /**
       * Is true if this node is part of a document.
       *
       * @type {boolean}
       */
      get isConnected() {
        var rootNode = this.getRootNode();
        return rootNode && rootNode.nodeType === rootNode.DOCUMENT_NODE;
      },
      /**
       * Checks whether `other` is an inclusive descendant of this node.
       *
       * @param {Node | null | undefined} other
       * The node to check.
       * @returns {boolean}
       * True if `other` is an inclusive descendant of this node; false otherwise.
       * @see https://dom.spec.whatwg.org/#dom-node-contains
       */
      contains: function(other) {
        if (!other) return false;
        var parent = other;
        do {
          if (this === parent) return true;
          parent = parent.parentNode;
        } while (parent);
        return false;
      },
      /**
       * @typedef GetRootNodeOptions
       * @property {boolean} [composed=false]
       */
      /**
       * Searches for the root node of this node.
       *
       * **This behavior is slightly different from the in the specs**:
       * - ignores `options.composed`, since `ShadowRoot`s are unsupported, always returns root.
       *
       * @param {GetRootNodeOptions} [options]
       * @returns {Node}
       * Root node.
       * @see https://dom.spec.whatwg.org/#dom-node-getrootnode
       * @see https://dom.spec.whatwg.org/#concept-shadow-including-root
       */
      getRootNode: function(options) {
        var parent = this;
        do {
          if (!parent.parentNode) {
            return parent;
          }
          parent = parent.parentNode;
        } while (parent);
      },
      /**
       * Checks whether the given node is equal to this node.
       *
       * Two nodes are equal when they have the same type, defining characteristics (for the type),
       * and the same childNodes. The comparison is iterative to avoid stack overflows on
       * deeply-nested trees. Attribute nodes of each Element pair are also pushed onto the stack
       * and compared the same way.
       *
       * @param {Node} [otherNode]
       * @returns {boolean}
       * @see https://dom.spec.whatwg.org/#concept-node-equals
       * @see ../docs/walk-dom.md.
       */
      isEqualNode: function(otherNode) {
        if (!otherNode) return false;
        var stack = [{ node: this, other: otherNode }];
        while (stack.length > 0) {
          var pair = stack.pop();
          var node = pair.node;
          var other = pair.other;
          if (node.nodeType !== other.nodeType) return false;
          switch (node.nodeType) {
            case node.DOCUMENT_TYPE_NODE:
              if (node.name !== other.name) return false;
              if (node.publicId !== other.publicId) return false;
              if (node.systemId !== other.systemId) return false;
              break;
            case node.ELEMENT_NODE:
              if (node.namespaceURI !== other.namespaceURI) return false;
              if (node.prefix !== other.prefix) return false;
              if (node.localName !== other.localName) return false;
              if (node.attributes.length !== other.attributes.length) return false;
              for (var i2 = 0; i2 < node.attributes.length; i2++) {
                var attr = node.attributes.item(i2);
                var otherAttr = other.getAttributeNodeNS(attr.namespaceURI, attr.localName);
                if (!otherAttr) return false;
                stack.push({ node: attr, other: otherAttr });
              }
              break;
            case node.ATTRIBUTE_NODE:
              if (node.namespaceURI !== other.namespaceURI) return false;
              if (node.localName !== other.localName) return false;
              if (node.value !== other.value) return false;
              break;
            case node.PROCESSING_INSTRUCTION_NODE:
              if (node.target !== other.target || node.data !== other.data) return false;
              break;
            case node.TEXT_NODE:
            case node.CDATA_SECTION_NODE:
            case node.COMMENT_NODE:
              if (node.data !== other.data) return false;
              break;
          }
          if (node.childNodes.length !== other.childNodes.length) return false;
          for (var i2 = node.childNodes.length - 1; i2 >= 0; i2--) {
            stack.push({ node: node.childNodes[i2], other: other.childNodes[i2] });
          }
        }
        return true;
      },
      /**
       * Checks whether or not the given node is this node.
       *
       * @param {Node} [otherNode]
       */
      isSameNode: function(otherNode) {
        return this === otherNode;
      },
      /**
       * Inserts a node before a reference node as a child of this node.
       *
       * @param {Node} newChild
       * The new child node to be inserted.
       * @param {Node | null} refChild
       * The reference node before which newChild will be inserted.
       * @returns {Node}
       * The new child node successfully inserted.
       * @throws {DOMException}
       * Throws a DOMException if inserting the node would result in a DOM tree that is not
       * well-formed, or if `child` is provided but is not a child of `parent`.
       * See {@link _insertBefore} for more details.
       * @since Modified in DOM L2
       */
      insertBefore: function(newChild, refChild) {
        return _insertBefore(this, newChild, refChild);
      },
      /**
       * Replaces an old child node with a new child node within this node.
       *
       * @param {Node} newChild
       * The new node that is to replace the old node.
       * If it already exists in the DOM, it is removed from its original position.
       * @param {Node} oldChild
       * The existing child node to be replaced.
       * @returns {Node}
       * Returns the replaced child node.
       * @throws {DOMException}
       * Throws a DOMException if replacing the node would result in a DOM tree that is not
       * well-formed, or if `oldChild` is not a child of `this`.
       * This can also occur if the pre-replacement validity assertion fails.
       * See {@link _insertBefore}, {@link Node.removeChild}, and
       * {@link assertPreReplacementValidityInDocument} for more details.
       * @see https://dom.spec.whatwg.org/#concept-node-replace
       */
      replaceChild: function(newChild, oldChild) {
        _insertBefore(this, newChild, oldChild, assertPreReplacementValidityInDocument);
        if (oldChild) {
          this.removeChild(oldChild);
        }
      },
      /**
       * Removes an existing child node from this node.
       *
       * @param {Node} oldChild
       * The child node to be removed.
       * @returns {Node}
       * Returns the removed child node.
       * @throws {DOMException}
       * Throws a DOMException if `oldChild` is not a child of `this`.
       * See {@link _removeChild} for more details.
       */
      removeChild: function(oldChild) {
        return _removeChild(this, oldChild);
      },
      /**
       * Appends a child node to this node.
       *
       * @param {Node} newChild
       * The child node to be appended to this node.
       * If it already exists in the DOM, it is removed from its original position.
       * @returns {Node}
       * Returns the appended child node.
       * @throws {DOMException}
       * Throws a DOMException if appending the node would result in a DOM tree that is not
       * well-formed, or if `newChild` is not a valid Node.
       * See {@link insertBefore} for more details.
       */
      appendChild: function(newChild) {
        return this.insertBefore(newChild, null);
      },
      /**
       * Determines whether this node has any child nodes.
       *
       * @returns {boolean}
       * Returns true if this node has any child nodes, and false otherwise.
       */
      hasChildNodes: function() {
        return this.firstChild != null;
      },
      /**
       * Creates a copy of the calling node.
       *
       * @param {boolean} deep
       * If true, the contents of the node are recursively copied.
       * If false, only the node itself (and its attributes, if it is an element) are copied.
       * @returns {Node}
       * Returns the newly created copy of the node.
       * @throws {DOMException}
       * May throw a DOMException if operations within {@link Element#setAttributeNode} or
       * {@link Node#appendChild} (which are potentially invoked in this method) do not meet their
       * specific constraints.
       * @see {@link cloneNode}
       */
      cloneNode: function(deep) {
        return cloneNode(this.ownerDocument || this, this, deep);
      },
      /**
       * Puts the specified node and all of its subtree into a "normalized" form. In a normalized
       * subtree, no text nodes in the subtree are empty and there are no adjacent text nodes.
       *
       * Specifically, this method merges any adjacent text nodes (i.e., nodes for which `nodeType`
       * is `TEXT_NODE`) into a single node with the combined data. It also removes any empty text
       * nodes.
       *
       * This method iterativly traverses all child nodes to normalize all descendent nodes within
       * the subtree.
       *
       * @throws {DOMException}
       * May throw a DOMException if operations within removeChild or appendData (which are
       * potentially invoked in this method) do not meet their specific constraints.
       * @since Modified in DOM Level 2
       * @see {@link Node.removeChild}
       * @see {@link CharacterData.appendData}
       * @see ../docs/walk-dom.md.
       */
      normalize: function() {
        walkDOM(this, null, {
          enter: function(node) {
            var child = node.firstChild;
            while (child) {
              var next = child.nextSibling;
              if (next !== null && next.nodeType === TEXT_NODE && child.nodeType === TEXT_NODE) {
                var tail = [];
                var sibling = next;
                while (sibling !== null && sibling.nodeType === TEXT_NODE) {
                  tail.push(sibling.data);
                  sibling = sibling.nextSibling;
                }
                var removed = child.nextSibling;
                while (removed !== sibling) {
                  var following = removed.nextSibling;
                  removed.parentNode = null;
                  removed.previousSibling = null;
                  removed.nextSibling = null;
                  removed = following;
                }
                child.nextSibling = sibling;
                if (sibling !== null) {
                  sibling.previousSibling = child;
                } else {
                  node.lastChild = child;
                }
                child.appendData(tail.join(""));
                _onUpdateChild(node.ownerDocument, node);
                child = sibling;
              } else {
                child = next;
              }
            }
            return true;
          }
        });
      },
      /**
       * Checks whether the DOM implementation implements a specific feature and its version.
       *
       * @deprecated
       * Since `DOMImplementation.hasFeature` is deprecated and always returns true.
       * @param {string} feature
       * The package name of the feature to test. This is the same name that can be passed to the
       * method `hasFeature` on `DOMImplementation`.
       * @param {string} version
       * This is the version number of the package name to test.
       * @returns {boolean}
       * Returns true in all cases in the current implementation.
       * @since Introduced in DOM Level 2
       * @see {@link DOMImplementation.hasFeature}
       */
      isSupported: function(feature, version) {
        return this.ownerDocument.implementation.hasFeature(feature, version);
      },
      /**
       * Look up the prefix associated to the given namespace URI, starting from this node.
       * **The default namespace declarations are ignored by this method.**
       * See Namespace Prefix Lookup for details on the algorithm used by this method.
       *
       * **This behavior is different from the in the specs**:
       * - no node type specific handling
       * - uses the internal attribute _nsMap for resolving namespaces that is updated when changing attributes
       *
       * @param {string | null} namespaceURI
       * The namespace URI for which to find the associated prefix.
       * @returns {string | null}
       * The associated prefix, if found; otherwise, null.
       * @see https://www.w3.org/TR/DOM-Level-3-Core/core.html#Node3-lookupNamespacePrefix
       * @see https://www.w3.org/TR/DOM-Level-3-Core/namespaces-algorithms.html#lookupNamespacePrefixAlgo
       * @see https://dom.spec.whatwg.org/#dom-node-lookupprefix
       * @see https://github.com/xmldom/xmldom/issues/322
       * @prettierignore
       */
      lookupPrefix: function(namespaceURI) {
        var el = this;
        while (el) {
          var map = el._nsMap;
          if (map) {
            for (var n in map) {
              if (hasOwn(map, n) && map[n] === namespaceURI) {
                return n;
              }
            }
          }
          el = el.nodeType == ATTRIBUTE_NODE ? el.ownerDocument : el.parentNode;
        }
        return null;
      },
      /**
       * This function is used to look up the namespace URI associated with the given prefix,
       * starting from this node.
       *
       * **This behavior is different from the in the specs**:
       * - no node type specific handling
       * - uses the internal attribute _nsMap for resolving namespaces that is updated when changing attributes
       *
       * @param {string | null} prefix
       * The prefix for which to find the associated namespace URI.
       * @returns {string | null}
       * The associated namespace URI, if found; otherwise, null.
       * @since DOM Level 3
       * @see https://dom.spec.whatwg.org/#dom-node-lookupnamespaceuri
       * @see https://www.w3.org/TR/DOM-Level-3-Core/core.html#Node3-lookupNamespaceURI
       * @prettierignore
       */
      lookupNamespaceURI: function(prefix) {
        var el = this;
        while (el) {
          var map = el._nsMap;
          if (map) {
            if (hasOwn(map, prefix)) {
              return map[prefix];
            }
          }
          el = el.nodeType == ATTRIBUTE_NODE ? el.ownerDocument : el.parentNode;
        }
        return null;
      },
      /**
       * Determines whether the given namespace URI is the default namespace.
       *
       * The function works by looking up the prefix associated with the given namespace URI. If no
       * prefix is found (i.e., the namespace URI is not registered in the namespace map of this
       * node or any of its ancestors), it returns `true`, implying the namespace URI is considered
       * the default.
       *
       * **This behavior is different from the in the specs**:
       * - no node type specific handling
       * - uses the internal attribute _nsMap for resolving namespaces that is updated when changing attributes
       *
       * @param {string | null} namespaceURI
       * The namespace URI to be checked.
       * @returns {boolean}
       * Returns true if the given namespace URI is the default namespace, false otherwise.
       * @since DOM Level 3
       * @see https://www.w3.org/TR/DOM-Level-3-Core/core.html#Node3-isDefaultNamespace
       * @see https://dom.spec.whatwg.org/#dom-node-isdefaultnamespace
       * @prettierignore
       */
      isDefaultNamespace: function(namespaceURI) {
        var prefix = this.lookupPrefix(namespaceURI);
        return prefix == null;
      },
      /**
       * Compares the reference node with a node with regard to their position in the document and
       * according to the document order.
       *
       * @param {Node} other
       * The node to compare the reference node to.
       * @returns {number}
       * Returns how the node is positioned relatively to the reference node according to the
       * bitmask. 0 if reference node and given node are the same.
       * @since DOM Level 3
       * @see https://www.w3.org/TR/2004/REC-DOM-Level-3-Core-20040407/core.html#Node3-compare
       * @see https://dom.spec.whatwg.org/#dom-node-comparedocumentposition
       */
      compareDocumentPosition: function(other) {
        if (this === other) return 0;
        var node1 = other;
        var node2 = this;
        var attr1 = null;
        var attr2 = null;
        if (node1 instanceof Attr) {
          attr1 = node1;
          node1 = attr1.ownerElement;
        }
        if (node2 instanceof Attr) {
          attr2 = node2;
          node2 = attr2.ownerElement;
          if (attr1 && node1 && node2 === node1) {
            for (var i2 = 0, attr; attr = node2.attributes[i2]; i2++) {
              if (attr === attr1)
                return DocumentPosition.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC + DocumentPosition.DOCUMENT_POSITION_PRECEDING;
              if (attr === attr2)
                return DocumentPosition.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC + DocumentPosition.DOCUMENT_POSITION_FOLLOWING;
            }
          }
        }
        if (!node1 || !node2 || node2.ownerDocument !== node1.ownerDocument) {
          return DocumentPosition.DOCUMENT_POSITION_DISCONNECTED + DocumentPosition.DOCUMENT_POSITION_IMPLEMENTATION_SPECIFIC + (docGUID(node2.ownerDocument) > docGUID(node1.ownerDocument) ? DocumentPosition.DOCUMENT_POSITION_FOLLOWING : DocumentPosition.DOCUMENT_POSITION_PRECEDING);
        }
        if (attr2 && node1 === node2) {
          return DocumentPosition.DOCUMENT_POSITION_CONTAINS + DocumentPosition.DOCUMENT_POSITION_PRECEDING;
        }
        if (attr1 && node1 === node2) {
          return DocumentPosition.DOCUMENT_POSITION_CONTAINED_BY + DocumentPosition.DOCUMENT_POSITION_FOLLOWING;
        }
        var chain1 = [];
        var ancestor1 = node1.parentNode;
        while (ancestor1) {
          if (!attr2 && ancestor1 === node2) {
            return DocumentPosition.DOCUMENT_POSITION_CONTAINED_BY + DocumentPosition.DOCUMENT_POSITION_FOLLOWING;
          }
          chain1.push(ancestor1);
          ancestor1 = ancestor1.parentNode;
        }
        chain1.reverse();
        var chain2 = [];
        var ancestor2 = node2.parentNode;
        while (ancestor2) {
          if (!attr1 && ancestor2 === node1) {
            return DocumentPosition.DOCUMENT_POSITION_CONTAINS + DocumentPosition.DOCUMENT_POSITION_PRECEDING;
          }
          chain2.push(ancestor2);
          ancestor2 = ancestor2.parentNode;
        }
        chain2.reverse();
        var ca = commonAncestor(chain1, chain2);
        for (var n in ca.childNodes) {
          var child = ca.childNodes[n];
          if (child === node2) return DocumentPosition.DOCUMENT_POSITION_FOLLOWING;
          if (child === node1) return DocumentPosition.DOCUMENT_POSITION_PRECEDING;
          if (chain2.indexOf(child) >= 0) return DocumentPosition.DOCUMENT_POSITION_FOLLOWING;
          if (chain1.indexOf(child) >= 0) return DocumentPosition.DOCUMENT_POSITION_PRECEDING;
        }
        return 0;
      }
    };
    function _xmlEncoder(c) {
      return c == "<" && "&lt;" || c == ">" && "&gt;" || c == "&" && "&amp;" || c == '"' && "&quot;" || "&#" + c.charCodeAt() + ";";
    }
    copy(NodeType, Node);
    copy(NodeType, Node.prototype);
    copy(DocumentPosition, Node);
    copy(DocumentPosition, Node.prototype);
    function _visitNode(node, callback) {
      walkDOM(node, null, {
        enter: function(n) {
          return callback(n) ? walkDOM.STOP : true;
        }
      });
    }
    function walkDOM(node, context, callbacks) {
      var stack = [{ node, context, phase: walkDOM.ENTER }];
      while (stack.length > 0) {
        var frame2 = stack.pop();
        if (frame2.phase === walkDOM.ENTER) {
          var childContext = callbacks.enter(frame2.node, frame2.context);
          if (childContext === walkDOM.STOP) {
            return walkDOM.STOP;
          }
          stack.push({ node: frame2.node, context: childContext, phase: walkDOM.EXIT });
          if (childContext === null || childContext === void 0) {
            continue;
          }
          var child = frame2.node.lastChild;
          while (child) {
            stack.push({ node: child, context: childContext, phase: walkDOM.ENTER });
            child = child.previousSibling;
          }
        } else {
          if (callbacks.exit) {
            callbacks.exit(frame2.node, frame2.context);
          }
        }
      }
    }
    walkDOM.STOP = Symbol("walkDOM.STOP");
    walkDOM.ENTER = 0;
    walkDOM.EXIT = 1;
    function Document(symbol, options) {
      checkSymbol(symbol);
      var opt = options || {};
      this.ownerDocument = this;
      this.contentType = opt.contentType || MIME_TYPE.XML_APPLICATION;
      this.type = isHTMLMimeType(this.contentType) ? "html" : "xml";
    }
    function _onAddAttribute(doc, el, newAttr) {
      doc && doc._inc++;
      var ns = newAttr.namespaceURI;
      if (ns === NAMESPACE.XMLNS) {
        el._nsMap[newAttr.prefix ? newAttr.localName : ""] = newAttr.value;
      }
    }
    function _onRemoveAttribute(doc, el, newAttr, remove) {
      doc && doc._inc++;
      var ns = newAttr.namespaceURI;
      if (ns === NAMESPACE.XMLNS) {
        delete el._nsMap[newAttr.prefix ? newAttr.localName : ""];
      }
    }
    function _onUpdateChild(doc, parent, newChild) {
      if (doc && doc._inc) {
        doc._inc++;
        var childNodes = parent.childNodes;
        if (newChild && !newChild.nextSibling) {
          childNodes[childNodes.length++] = newChild;
        } else {
          var child = parent.firstChild;
          var i2 = 0;
          while (child) {
            childNodes[i2++] = child;
            child = child.nextSibling;
          }
          childNodes.length = i2;
          delete childNodes[childNodes.length];
        }
      }
    }
    function _removeChild(parentNode, child) {
      if (parentNode !== child.parentNode) {
        throw new DOMException(DOMException.NOT_FOUND_ERR, "child's parent is not parent");
      }
      var oldPreviousSibling = child.previousSibling;
      var oldNextSibling = child.nextSibling;
      if (oldPreviousSibling) {
        oldPreviousSibling.nextSibling = oldNextSibling;
      } else {
        parentNode.firstChild = oldNextSibling;
      }
      if (oldNextSibling) {
        oldNextSibling.previousSibling = oldPreviousSibling;
      } else {
        parentNode.lastChild = oldPreviousSibling;
      }
      _onUpdateChild(parentNode.ownerDocument, parentNode);
      child.parentNode = null;
      child.previousSibling = null;
      child.nextSibling = null;
      return child;
    }
    function hasValidParentNodeType(node) {
      return node && (node.nodeType === Node.DOCUMENT_NODE || node.nodeType === Node.DOCUMENT_FRAGMENT_NODE || node.nodeType === Node.ELEMENT_NODE);
    }
    function hasInsertableNodeType(node) {
      return node && (node.nodeType === Node.CDATA_SECTION_NODE || node.nodeType === Node.COMMENT_NODE || node.nodeType === Node.DOCUMENT_FRAGMENT_NODE || node.nodeType === Node.DOCUMENT_TYPE_NODE || node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.PROCESSING_INSTRUCTION_NODE || node.nodeType === Node.TEXT_NODE);
    }
    function isDocTypeNode(node) {
      return node && node.nodeType === Node.DOCUMENT_TYPE_NODE;
    }
    function isElementNode(node) {
      return node && node.nodeType === Node.ELEMENT_NODE;
    }
    function isTextNode(node) {
      return node && node.nodeType === Node.TEXT_NODE;
    }
    function isElementInsertionPossible(doc, child) {
      var parentChildNodes = doc.childNodes || [];
      if (find(parentChildNodes, isElementNode) || isDocTypeNode(child)) {
        return false;
      }
      var docTypeNode = find(parentChildNodes, isDocTypeNode);
      return !(child && docTypeNode && parentChildNodes.indexOf(docTypeNode) > parentChildNodes.indexOf(child));
    }
    function isElementReplacementPossible(doc, child) {
      var parentChildNodes = doc.childNodes || [];
      function hasElementChildThatIsNotChild(node) {
        return isElementNode(node) && node !== child;
      }
      if (find(parentChildNodes, hasElementChildThatIsNotChild)) {
        return false;
      }
      var docTypeNode = find(parentChildNodes, isDocTypeNode);
      return !(child && docTypeNode && parentChildNodes.indexOf(docTypeNode) > parentChildNodes.indexOf(child));
    }
    function assertPreInsertionValidity1to5(parent, node, child) {
      if (!hasValidParentNodeType(parent)) {
        throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, "Unexpected parent node type " + parent.nodeType);
      }
      if (child && child.parentNode !== parent) {
        throw new DOMException(DOMException.NOT_FOUND_ERR, "child not in parent");
      }
      if (
        // 4. If `node` is not a DocumentFragment, DocumentType, Element, or CharacterData node, then throw a "HierarchyRequestError" DOMException.
        !hasInsertableNodeType(node) || // 5. If either `node` is a Text node and `parent` is a document,
        // the sax parser currently adds top level text nodes, this will be fixed in 0.9.0
        // || (node.nodeType === Node.TEXT_NODE && parent.nodeType === Node.DOCUMENT_NODE)
        // or `node` is a doctype and `parent` is not a document, then throw a "HierarchyRequestError" DOMException.
        isDocTypeNode(node) && parent.nodeType !== Node.DOCUMENT_NODE
      ) {
        throw new DOMException(
          DOMException.HIERARCHY_REQUEST_ERR,
          "Unexpected node type " + node.nodeType + " for parent node type " + parent.nodeType
        );
      }
    }
    function assertPreInsertionValidityInDocument(parent, node, child) {
      var parentChildNodes = parent.childNodes || [];
      var nodeChildNodes = node.childNodes || [];
      if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
        var nodeChildElements = nodeChildNodes.filter(isElementNode);
        if (nodeChildElements.length > 1 || find(nodeChildNodes, isTextNode)) {
          throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, "More than one element or text in fragment");
        }
        if (nodeChildElements.length === 1 && !isElementInsertionPossible(parent, child)) {
          throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, "Element in fragment can not be inserted before doctype");
        }
      }
      if (isElementNode(node)) {
        if (!isElementInsertionPossible(parent, child)) {
          throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, "Only one element can be added and only after doctype");
        }
      }
      if (isDocTypeNode(node)) {
        if (find(parentChildNodes, isDocTypeNode)) {
          throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, "Only one doctype is allowed");
        }
        var parentElementChild = find(parentChildNodes, isElementNode);
        if (child && parentChildNodes.indexOf(parentElementChild) < parentChildNodes.indexOf(child)) {
          throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, "Doctype can only be inserted before an element");
        }
        if (!child && parentElementChild) {
          throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, "Doctype can not be appended since element is present");
        }
      }
    }
    function assertPreReplacementValidityInDocument(parent, node, child) {
      var parentChildNodes = parent.childNodes || [];
      var nodeChildNodes = node.childNodes || [];
      if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
        var nodeChildElements = nodeChildNodes.filter(isElementNode);
        if (nodeChildElements.length > 1 || find(nodeChildNodes, isTextNode)) {
          throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, "More than one element or text in fragment");
        }
        if (nodeChildElements.length === 1 && !isElementReplacementPossible(parent, child)) {
          throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, "Element in fragment can not be inserted before doctype");
        }
      }
      if (isElementNode(node)) {
        if (!isElementReplacementPossible(parent, child)) {
          throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, "Only one element can be added and only after doctype");
        }
      }
      if (isDocTypeNode(node)) {
        let hasDoctypeChildThatIsNotChild = function(node2) {
          return isDocTypeNode(node2) && node2 !== child;
        };
        if (find(parentChildNodes, hasDoctypeChildThatIsNotChild)) {
          throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, "Only one doctype is allowed");
        }
        var parentElementChild = find(parentChildNodes, isElementNode);
        if (child && parentChildNodes.indexOf(parentElementChild) < parentChildNodes.indexOf(child)) {
          throw new DOMException(DOMException.HIERARCHY_REQUEST_ERR, "Doctype can only be inserted before an element");
        }
      }
    }
    function _insertBefore(parent, node, child, _inDocumentAssertion) {
      assertPreInsertionValidity1to5(parent, node, child);
      if (parent.nodeType === Node.DOCUMENT_NODE) {
        (_inDocumentAssertion || assertPreInsertionValidityInDocument)(parent, node, child);
      }
      var cp = node.parentNode;
      if (cp) {
        cp.removeChild(node);
      }
      if (node.nodeType === DOCUMENT_FRAGMENT_NODE) {
        var newFirst = node.firstChild;
        if (newFirst == null) {
          return node;
        }
        var newLast = node.lastChild;
      } else {
        newFirst = newLast = node;
      }
      var pre = child ? child.previousSibling : parent.lastChild;
      newFirst.previousSibling = pre;
      newLast.nextSibling = child;
      if (pre) {
        pre.nextSibling = newFirst;
      } else {
        parent.firstChild = newFirst;
      }
      if (child == null) {
        parent.lastChild = newLast;
      } else {
        child.previousSibling = newLast;
      }
      do {
        newFirst.parentNode = parent;
      } while (newFirst !== newLast && (newFirst = newFirst.nextSibling));
      _onUpdateChild(parent.ownerDocument || parent, parent, node);
      if (node.nodeType == DOCUMENT_FRAGMENT_NODE) {
        node.firstChild = node.lastChild = null;
      }
      return node;
    }
    Document.prototype = {
      /**
       * The implementation that created this document.
       *
       * @type DOMImplementation
       * @readonly
       */
      implementation: null,
      nodeName: "#document",
      nodeType: DOCUMENT_NODE,
      /**
       * The DocumentType node of the document.
       *
       * @type DocumentType
       * @readonly
       */
      doctype: null,
      documentElement: null,
      _inc: 1,
      insertBefore: function(newChild, refChild) {
        if (newChild.nodeType === DOCUMENT_FRAGMENT_NODE) {
          var child = newChild.firstChild;
          while (child) {
            var next = child.nextSibling;
            this.insertBefore(child, refChild);
            child = next;
          }
          return newChild;
        }
        _insertBefore(this, newChild, refChild);
        newChild.ownerDocument = this;
        if (this.documentElement === null && newChild.nodeType === ELEMENT_NODE) {
          this.documentElement = newChild;
        }
        return newChild;
      },
      removeChild: function(oldChild) {
        var removed = _removeChild(this, oldChild);
        if (removed === this.documentElement) {
          this.documentElement = null;
        }
        return removed;
      },
      replaceChild: function(newChild, oldChild) {
        _insertBefore(this, newChild, oldChild, assertPreReplacementValidityInDocument);
        newChild.ownerDocument = this;
        if (oldChild) {
          this.removeChild(oldChild);
        }
        if (isElementNode(newChild)) {
          this.documentElement = newChild;
        }
      },
      /**
       * Imports a node from another document into this document, creating a new copy owned by this
       * document. The source node and its subtree are not modified.
       *
       * @param {Node} importedNode
       * The node to import.
       * @param {boolean} deep
       * If true, the contents of the node are recursively imported.
       * If false, only the node itself (and its attributes, if it is an element) are imported.
       * @returns {Node}
       * Returns the newly created import of the node.
       * @see {@link importNode}
       * @see {@link https://dom.spec.whatwg.org/#dom-document-importnode}
       */
      importNode: function(importedNode, deep) {
        return importNode(this, importedNode, deep);
      },
      // Introduced in DOM Level 2:
      getElementById: function(id) {
        var rtv = null;
        _visitNode(this.documentElement, function(node) {
          if (node.nodeType == ELEMENT_NODE) {
            if (node.getAttribute("id") == id) {
              rtv = node;
              return true;
            }
          }
        });
        return rtv;
      },
      /**
       * Creates a new `Element` that is owned by this `Document`.
       * In HTML Documents `localName` is the lower cased `tagName`,
       * otherwise no transformation is being applied.
       * When `contentType` implies the HTML namespace, it will be set as `namespaceURI`.
       *
       * __This implementation differs from the specification:__ - The provided name is not checked
       * against the `Name` production,
       * so no related error will be thrown.
       * - There is no interface `HTMLElement`, it is always an `Element`.
       * - There is no support for a second argument to indicate using custom elements.
       *
       * @param {string} tagName
       * @returns {Element}
       * @see https://developer.mozilla.org/en-US/docs/Web/API/Document/createElement
       * @see https://dom.spec.whatwg.org/#dom-document-createelement
       * @see https://dom.spec.whatwg.org/#concept-create-element
       */
      createElement: function(tagName) {
        var node = new Element(PDC);
        node.ownerDocument = this;
        if (this.type === "html") {
          tagName = tagName.toLowerCase();
        }
        if (hasDefaultHTMLNamespace(this.contentType)) {
          node.namespaceURI = NAMESPACE.HTML;
        }
        node.nodeName = tagName;
        node.tagName = tagName;
        node.localName = tagName;
        node.childNodes = new NodeList();
        var attrs = node.attributes = new NamedNodeMap();
        attrs._ownerElement = node;
        return node;
      },
      /**
       * @returns {DocumentFragment}
       */
      createDocumentFragment: function() {
        var node = new DocumentFragment(PDC);
        node.ownerDocument = this;
        node.childNodes = new NodeList();
        return node;
      },
      /**
       * @param {string} data
       * @returns {Text}
       */
      createTextNode: function(data) {
        var node = new Text(PDC);
        node.ownerDocument = this;
        node.childNodes = new NodeList();
        node.appendData(data);
        return node;
      },
      /**
       * @param {string} data
       * @returns {Comment}
       * @see https://dom.spec.whatwg.org/#dom-document-createcomment
       * @see https://www.w3.org/TR/xml/#NT-Comment XML 1.0 production [15]
       * @see https://www.w3.org/TR/DOM-Parsing/#dfn-concept-serialize-xml §3.2.1.3
       *
       *      Note: no validation is performed at creation time. When the resulting document is
       *      serialized with `requireWellFormed: true`, the serializer throws `InvalidStateError`
       *      if the comment data contains `--` anywhere, ends with `-`, or contains characters
       *      outside the XML Char production (W3C DOM Parsing §3.2.1.3). Without that option the
       *      data is emitted verbatim.
       */
      createComment: function(data) {
        var node = new Comment(PDC);
        node.ownerDocument = this;
        node.childNodes = new NodeList();
        node.appendData(data);
        return node;
      },
      /**
       * Returns a new CDATASection node whose data is `data`.
       *
       * __This implementation differs from the specification:__ - calling this method on an HTML
       * document does not throw `NotSupportedError`.
       *
       * @param {string} data
       * @returns {CDATASection}
       * @throws {DOMException}
       * With code `INVALID_CHARACTER_ERR` if `data` contains `"]]>"`.
       * @see https://developer.mozilla.org/en-US/docs/Web/API/Document/createCDATASection
       * @see https://dom.spec.whatwg.org/#dom-document-createcdatasection
       */
      createCDATASection: function(data) {
        if (data.indexOf("]]>") !== -1) {
          throw new DOMException(DOMException.INVALID_CHARACTER_ERR, 'data contains "]]>"');
        }
        var node = new CDATASection(PDC);
        node.ownerDocument = this;
        node.childNodes = new NodeList();
        node.appendData(data);
        return node;
      },
      /**
       * Returns a ProcessingInstruction node whose target is target and data is data.
       *
       * __This behavior is slightly different from the in the specs__:
       * - it does not do any input validation on the arguments and doesn't throw
       * "InvalidCharacterError".
       *
       * Note: When the resulting document is serialized with `requireWellFormed: true`, the
       * serializer throws `InvalidStateError` if `.target` is not a valid XML `NCName` (a `Name`
       * with no colon) or is an ASCII case-insensitive match for `"xml"`, or if `.data` contains
       * `?>` or characters outside the XML Char production (W3C DOM Parsing §3.2.1.7). Without that
       * option the target and data are emitted verbatim.
       *
       * @param {string} target
       * @param {string} data
       * @returns {ProcessingInstruction}
       * @see https://developer.mozilla.org/docs/Web/API/Document/createProcessingInstruction
       * @see https://dom.spec.whatwg.org/#dom-document-createprocessinginstruction
       * @see https://www.w3.org/TR/DOM-Parsing/#dfn-concept-serialize-xml §3.2.1.7
       */
      createProcessingInstruction: function(target, data) {
        var node = new ProcessingInstruction(PDC);
        node.ownerDocument = this;
        node.childNodes = new NodeList();
        node.nodeName = node.target = target;
        node.nodeValue = node.data = data;
        return node;
      },
      /**
       * Creates an `Attr` node that is owned by this document.
       * In HTML Documents `localName` is the lower cased `name`,
       * otherwise no transformation is being applied.
       *
       * __This implementation differs from the specification:__ - The provided name is not checked
       * against the `Name` production,
       * so no related error will be thrown.
       *
       * @param {string} name
       * @returns {Attr}
       * @see https://developer.mozilla.org/en-US/docs/Web/API/Document/createAttribute
       * @see https://dom.spec.whatwg.org/#dom-document-createattribute
       */
      createAttribute: function(name) {
        if (!g.QName_exact.test(name)) {
          throw new DOMException(DOMException.INVALID_CHARACTER_ERR, 'invalid character in name "' + name + '"');
        }
        if (this.type === "html") {
          name = name.toLowerCase();
        }
        return this._createAttribute(name);
      },
      _createAttribute: function(name) {
        var node = new Attr(PDC);
        node.ownerDocument = this;
        node.childNodes = new NodeList();
        node.name = name;
        node.nodeName = name;
        node.localName = name;
        node.specified = true;
        return node;
      },
      /**
       * Creates an EntityReference object.
       * The current implementation does not fill the `childNodes` with those of the corresponding
       * `Entity`
       *
       * The `name` is validated against the XML `Name` production at creation time; an invalid name
       * throws `InvalidCharacterError`. When the resulting node is serialized with
       * `requireWellFormed: true`, the serializer re-validates `nodeName` against the XML `Name`
       * production and throws `InvalidStateError` if a later `nodeName` mutation made it invalid;
       * without that option the name is emitted verbatim.
       *
       * __This implementation differs from the specification:__ xmldom does not expand entities —
       * the parser resolves entity references inline and never constructs `EntityReference` nodes,
       * so this method is the only producer.
       *
       * @deprecated
       * In DOM Level 4.
       * @param {string} name
       * The name of the entity to reference. No namespace well-formedness checks are performed.
       * @returns {EntityReference}
       * @throws {DOMException}
       * With code `INVALID_CHARACTER_ERR` when `name` is not a valid XML `Name`.
       * @throws {DOMException}
       * with code `NOT_SUPPORTED_ERR` when the document is of type `html`
       * @see https://www.w3.org/TR/DOM-Level-3-Core/core.html#ID-392B75AE
       */
      createEntityReference: function(name) {
        if (!g.Name_exact.test(name)) {
          throw new DOMException(DOMException.INVALID_CHARACTER_ERR, 'not a valid xml name "' + name + '"');
        }
        if (this.type === "html") {
          throw new DOMException("document is an html document", DOMExceptionName.NotSupportedError);
        }
        var node = new EntityReference(PDC);
        node.ownerDocument = this;
        node.childNodes = new NodeList();
        node.nodeName = name;
        return node;
      },
      // Introduced in DOM Level 2:
      /**
       * @param {string} namespaceURI
       * @param {string} qualifiedName
       * @returns {Element}
       */
      createElementNS: function(namespaceURI, qualifiedName) {
        var validated = validateAndExtract(namespaceURI, qualifiedName);
        var node = new Element(PDC);
        var attrs = node.attributes = new NamedNodeMap();
        node.childNodes = new NodeList();
        node.ownerDocument = this;
        node.nodeName = qualifiedName;
        node.tagName = qualifiedName;
        node.namespaceURI = validated[0];
        node.prefix = validated[1];
        node.localName = validated[2];
        attrs._ownerElement = node;
        return node;
      },
      // Introduced in DOM Level 2:
      /**
       * @param {string} namespaceURI
       * @param {string} qualifiedName
       * @returns {Attr}
       */
      createAttributeNS: function(namespaceURI, qualifiedName) {
        var validated = validateAndExtract(namespaceURI, qualifiedName);
        var node = new Attr(PDC);
        node.ownerDocument = this;
        node.childNodes = new NodeList();
        node.nodeName = qualifiedName;
        node.name = qualifiedName;
        node.specified = true;
        node.namespaceURI = validated[0];
        node.prefix = validated[1];
        node.localName = validated[2];
        return node;
      }
    };
    _extends(Document, Node);
    function Element(symbol) {
      checkSymbol(symbol);
      this._nsMap = /* @__PURE__ */ Object.create(null);
    }
    Element.prototype = {
      nodeType: ELEMENT_NODE,
      /**
       * The attributes of this element.
       *
       * @type {NamedNodeMap | null}
       */
      attributes: null,
      getQualifiedName: function() {
        return this.prefix ? this.prefix + ":" + this.localName : this.localName;
      },
      _isInHTMLDocumentAndNamespace: function() {
        return this.ownerDocument.type === "html" && this.namespaceURI === NAMESPACE.HTML;
      },
      /**
       * Implementaton of Level2 Core function hasAttributes.
       *
       * @returns {boolean}
       * True if attribute list is not empty.
       * @see https://www.w3.org/TR/DOM-Level-2-Core/#core-ID-NodeHasAttrs
       */
      hasAttributes: function() {
        return !!(this.attributes && this.attributes.length);
      },
      hasAttribute: function(name) {
        return !!this.getAttributeNode(name);
      },
      /**
       * Returns element’s first attribute whose qualified name is `name`, and `null`
       * if there is no such attribute.
       *
       * @param {string} name
       * @returns {string | null}
       */
      getAttribute: function(name) {
        var attr = this.getAttributeNode(name);
        return attr ? attr.value : null;
      },
      getAttributeNode: function(name) {
        if (this._isInHTMLDocumentAndNamespace()) {
          name = name.toLowerCase();
        }
        return this.attributes.getNamedItem(name);
      },
      /**
       * Sets the value of element’s first attribute whose qualified name is qualifiedName to value.
       *
       * @param {string} name
       * @param {string} value
       */
      setAttribute: function(name, value) {
        if (this._isInHTMLDocumentAndNamespace()) {
          name = name.toLowerCase();
        }
        var attr = this.getAttributeNode(name);
        if (attr) {
          attr.value = attr.nodeValue = "" + value;
        } else {
          attr = this.ownerDocument._createAttribute(name);
          attr.value = attr.nodeValue = "" + value;
          this.setAttributeNode(attr);
        }
      },
      removeAttribute: function(name) {
        var attr = this.getAttributeNode(name);
        attr && this.removeAttributeNode(attr);
      },
      setAttributeNode: function(newAttr) {
        return this.attributes.setNamedItem(newAttr);
      },
      setAttributeNodeNS: function(newAttr) {
        return this.attributes.setNamedItemNS(newAttr);
      },
      removeAttributeNode: function(oldAttr) {
        return this.attributes.removeNamedItem(oldAttr.nodeName);
      },
      //get real attribute name,and remove it by removeAttributeNode
      removeAttributeNS: function(namespaceURI, localName) {
        var old = this.getAttributeNodeNS(namespaceURI, localName);
        old && this.removeAttributeNode(old);
      },
      hasAttributeNS: function(namespaceURI, localName) {
        return this.getAttributeNodeNS(namespaceURI, localName) != null;
      },
      /**
       * Returns element’s attribute whose namespace is `namespaceURI` and local name is
       * `localName`,
       * or `null` if there is no such attribute.
       *
       * @param {string} namespaceURI
       * @param {string} localName
       * @returns {string | null}
       */
      getAttributeNS: function(namespaceURI, localName) {
        var attr = this.getAttributeNodeNS(namespaceURI, localName);
        return attr ? attr.value : null;
      },
      /**
       * Sets the value of element’s attribute whose namespace is `namespaceURI` and local name is
       * `localName` to value.
       *
       * @param {string} namespaceURI
       * @param {string} qualifiedName
       * @param {string} value
       * @see https://dom.spec.whatwg.org/#dom-element-setattributens
       */
      setAttributeNS: function(namespaceURI, qualifiedName, value) {
        var validated = validateAndExtract(namespaceURI, qualifiedName);
        var localName = validated[2];
        var attr = this.getAttributeNodeNS(namespaceURI, localName);
        if (attr) {
          attr.value = attr.nodeValue = "" + value;
        } else {
          attr = this.ownerDocument.createAttributeNS(namespaceURI, qualifiedName);
          attr.value = attr.nodeValue = "" + value;
          this.setAttributeNode(attr);
        }
      },
      getAttributeNodeNS: function(namespaceURI, localName) {
        return this.attributes.getNamedItemNS(namespaceURI, localName);
      },
      /**
       * Returns a LiveNodeList of all child elements which have **all** of the given class name(s).
       *
       * Returns an empty list if `classNames` is an empty string or only contains HTML white space
       * characters.
       *
       * Warning: This returns a live LiveNodeList.
       * Changes in the DOM will reflect in the array as the changes occur.
       * If an element selected by this array no longer qualifies for the selector,
       * it will automatically be removed. Be aware of this for iteration purposes.
       *
       * @param {string} classNames
       * Is a string representing the class name(s) to match; multiple class names are separated by
       * (ASCII-)whitespace.
       * @see https://developer.mozilla.org/en-US/docs/Web/API/Element/getElementsByClassName
       * @see https://developer.mozilla.org/en-US/docs/Web/API/Document/getElementsByClassName
       * @see https://dom.spec.whatwg.org/#concept-getelementsbyclassname
       */
      getElementsByClassName: function(classNames) {
        var classNamesSet = toOrderedSet(classNames);
        return new LiveNodeList(this, function(base) {
          var ls = [];
          if (classNamesSet.length > 0) {
            _visitNode(base, function(node) {
              if (node !== base && node.nodeType === ELEMENT_NODE) {
                var nodeClassNames = node.getAttribute("class");
                if (nodeClassNames) {
                  var matches = classNames === nodeClassNames;
                  if (!matches) {
                    var nodeClassNamesSet = toOrderedSet(nodeClassNames);
                    matches = classNamesSet.every(arrayIncludes(nodeClassNamesSet));
                  }
                  if (matches) {
                    ls.push(node);
                  }
                }
              }
            });
          }
          return ls;
        });
      },
      /**
       * Returns a LiveNodeList of elements with the given qualifiedName.
       * Searching for all descendants can be done by passing `*` as `qualifiedName`.
       *
       * All descendants of the specified element are searched, but not the element itself.
       * The returned list is live, which means it updates itself with the DOM tree automatically.
       * Therefore, there is no need to call `Element.getElementsByTagName()`
       * with the same element and arguments repeatedly if the DOM changes in between calls.
       *
       * When called on an HTML element in an HTML document,
       * `getElementsByTagName` lower-cases the argument before searching for it.
       * This is undesirable when trying to match camel-cased SVG elements (such as
       * `<linearGradient>`) in an HTML document.
       * Instead, use `Element.getElementsByTagNameNS()`,
       * which preserves the capitalization of the tag name.
       *
       * `Element.getElementsByTagName` is similar to `Document.getElementsByTagName()`,
       * except that it only searches for elements that are descendants of the specified element.
       *
       * @param {string} qualifiedName
       * @returns {LiveNodeList}
       * @see https://developer.mozilla.org/en-US/docs/Web/API/Element/getElementsByTagName
       * @see https://dom.spec.whatwg.org/#concept-getelementsbytagname
       */
      getElementsByTagName: function(qualifiedName) {
        var isHTMLDocument = (this.nodeType === DOCUMENT_NODE ? this : this.ownerDocument).type === "html";
        var lowerQualifiedName = qualifiedName.toLowerCase();
        return new LiveNodeList(this, function(base) {
          var ls = [];
          _visitNode(base, function(node) {
            if (node === base || node.nodeType !== ELEMENT_NODE) {
              return;
            }
            if (qualifiedName === "*") {
              ls.push(node);
            } else {
              var nodeQualifiedName = node.getQualifiedName();
              var matchingQName = isHTMLDocument && node.namespaceURI === NAMESPACE.HTML ? lowerQualifiedName : qualifiedName;
              if (nodeQualifiedName === matchingQName) {
                ls.push(node);
              }
            }
          });
          return ls;
        });
      },
      getElementsByTagNameNS: function(namespaceURI, localName) {
        return new LiveNodeList(this, function(base) {
          var ls = [];
          _visitNode(base, function(node) {
            if (node !== base && node.nodeType === ELEMENT_NODE && (namespaceURI === "*" || node.namespaceURI === namespaceURI) && (localName === "*" || node.localName == localName)) {
              ls.push(node);
            }
          });
          return ls;
        });
      }
    };
    Document.prototype.getElementsByClassName = Element.prototype.getElementsByClassName;
    Document.prototype.getElementsByTagName = Element.prototype.getElementsByTagName;
    Document.prototype.getElementsByTagNameNS = Element.prototype.getElementsByTagNameNS;
    _extends(Element, Node);
    function Attr(symbol) {
      checkSymbol(symbol);
      this.namespaceURI = null;
      this.prefix = null;
      this.ownerElement = null;
    }
    Attr.prototype.nodeType = ATTRIBUTE_NODE;
    _extends(Attr, Node);
    function CharacterData(symbol) {
      checkSymbol(symbol);
    }
    CharacterData.prototype = {
      data: "",
      substringData: function(offset, count) {
        return this.data.substring(offset, offset + count);
      },
      appendData: function(text) {
        text = this.data + text;
        this.nodeValue = this.data = text;
        this.length = text.length;
      },
      insertData: function(offset, text) {
        this.replaceData(offset, 0, text);
      },
      deleteData: function(offset, count) {
        this.replaceData(offset, count, "");
      },
      replaceData: function(offset, count, text) {
        var start = this.data.substring(0, offset);
        var end = this.data.substring(offset + count);
        text = start + text + end;
        this.nodeValue = this.data = text;
        this.length = text.length;
      }
    };
    _extends(CharacterData, Node);
    function Text(symbol) {
      checkSymbol(symbol);
    }
    Text.prototype = {
      nodeName: "#text",
      nodeType: TEXT_NODE,
      splitText: function(offset) {
        var text = this.data;
        var newText = text.substring(offset);
        text = text.substring(0, offset);
        this.data = this.nodeValue = text;
        this.length = text.length;
        var newNode = this.ownerDocument.createTextNode(newText);
        if (this.parentNode) {
          this.parentNode.insertBefore(newNode, this.nextSibling);
        }
        return newNode;
      }
    };
    _extends(Text, CharacterData);
    function Comment(symbol) {
      checkSymbol(symbol);
    }
    Comment.prototype = {
      nodeName: "#comment",
      nodeType: COMMENT_NODE
    };
    _extends(Comment, CharacterData);
    function CDATASection(symbol) {
      checkSymbol(symbol);
    }
    CDATASection.prototype = {
      nodeName: "#cdata-section",
      nodeType: CDATA_SECTION_NODE
    };
    _extends(CDATASection, Text);
    function DocumentType(symbol) {
      checkSymbol(symbol);
    }
    DocumentType.prototype.nodeType = DOCUMENT_TYPE_NODE;
    _extends(DocumentType, Node);
    function Notation(symbol) {
      checkSymbol(symbol);
    }
    Notation.prototype.nodeType = NOTATION_NODE;
    _extends(Notation, Node);
    function Entity(symbol) {
      checkSymbol(symbol);
    }
    Entity.prototype.nodeType = ENTITY_NODE;
    _extends(Entity, Node);
    function EntityReference(symbol) {
      checkSymbol(symbol);
    }
    EntityReference.prototype.nodeType = ENTITY_REFERENCE_NODE;
    _extends(EntityReference, Node);
    function DocumentFragment(symbol) {
      checkSymbol(symbol);
    }
    DocumentFragment.prototype.nodeName = "#document-fragment";
    DocumentFragment.prototype.nodeType = DOCUMENT_FRAGMENT_NODE;
    _extends(DocumentFragment, Node);
    function ProcessingInstruction(symbol) {
      checkSymbol(symbol);
    }
    ProcessingInstruction.prototype.nodeType = PROCESSING_INSTRUCTION_NODE;
    _extends(ProcessingInstruction, CharacterData);
    function XMLSerializer() {
    }
    XMLSerializer.prototype.serializeToString = function(node, options) {
      return nodeSerializeToString.call(node, options);
    };
    Node.prototype.toString = nodeSerializeToString;
    function nodeSerializeToString(options) {
      var opts;
      if (typeof options === "function") {
        opts = { requireWellFormed: false, splitCDATASections: true, nodeFilter: options };
      } else if (options != null) {
        opts = {
          requireWellFormed: !!options.requireWellFormed,
          splitCDATASections: options.splitCDATASections !== false,
          nodeFilter: options.nodeFilter || null
        };
      } else {
        opts = { requireWellFormed: false, splitCDATASections: true, nodeFilter: null };
      }
      var buf = [];
      var refNode = this.nodeType === DOCUMENT_NODE && this.documentElement || this;
      var prefix = refNode.prefix;
      var uri = refNode.namespaceURI;
      if (uri && prefix == null) {
        var prefix = refNode.lookupPrefix(uri);
        if (prefix == null) {
          var visibleNamespaces = [
            { namespace: uri, prefix: null }
            //{namespace:uri,prefix:''}
          ];
        }
      }
      serializeToString(this, buf, visibleNamespaces, opts);
      return buf.join("");
    }
    function needNamespaceDefine(node, isHTML, visibleNamespaces) {
      var prefix = node.prefix || "";
      var uri = node.namespaceURI;
      if (!uri) {
        return false;
      }
      if (prefix === "xml" && uri === NAMESPACE.XML || uri === NAMESPACE.XMLNS) {
        return false;
      }
      var i2 = visibleNamespaces.length;
      while (i2--) {
        var ns = visibleNamespaces[i2];
        if (ns.prefix === prefix) {
          return ns.namespace !== uri;
        }
      }
      return true;
    }
    function addSerializedAttribute(buf, qualifiedName, value, requireWellFormed) {
      if (requireWellFormed && !g.QName_exact.test(qualifiedName)) {
        throw new DOMException(
          'The attribute name "' + qualifiedName + '" is not a valid XML QName',
          DOMExceptionName.InvalidStateError
        );
      }
      buf.push(" ", qualifiedName, '="', value.replace(/[<>&"\t\n\r]/g, _xmlEncoder), '"');
    }
    function serializeToString(node, buf, visibleNamespaces, opts) {
      if (!visibleNamespaces) {
        visibleNamespaces = [];
      }
      var nodeFilter = opts.nodeFilter;
      var requireWellFormed = opts.requireWellFormed;
      var splitCDATASections = opts.splitCDATASections;
      var doc = node.nodeType === DOCUMENT_NODE ? node : node.ownerDocument;
      var isHTML = doc.type === "html";
      walkDOM(
        node,
        { ns: visibleNamespaces },
        {
          enter: function(n, ctx) {
            var namespaces = ctx.ns;
            if (nodeFilter) {
              n = nodeFilter(n);
              if (n) {
                if (typeof n == "string") {
                  buf.push(n);
                  return null;
                }
              } else {
                return null;
              }
            }
            switch (n.nodeType) {
              case ELEMENT_NODE:
                var attrs = n.attributes;
                var len = attrs.length;
                var nodeName = n.tagName;
                var prefixedNodeName = nodeName;
                if (!isHTML && !n.prefix && n.namespaceURI) {
                  var defaultNS;
                  for (var ai = 0; ai < attrs.length; ai++) {
                    if (attrs.item(ai).name === "xmlns") {
                      defaultNS = attrs.item(ai).value;
                      break;
                    }
                  }
                  if (!defaultNS) {
                    for (var nsi = namespaces.length - 1; nsi >= 0; nsi--) {
                      var nsEntry = namespaces[nsi];
                      if (nsEntry.prefix === "" && nsEntry.namespace === n.namespaceURI) {
                        defaultNS = nsEntry.namespace;
                        break;
                      }
                    }
                  }
                  if (defaultNS !== n.namespaceURI) {
                    for (var nsi = namespaces.length - 1; nsi >= 0; nsi--) {
                      var nsEntry = namespaces[nsi];
                      if (nsEntry.namespace === n.namespaceURI) {
                        if (nsEntry.prefix) {
                          prefixedNodeName = nsEntry.prefix + ":" + nodeName;
                        }
                        break;
                      }
                    }
                  }
                }
                if (requireWellFormed && !g.QName_exact.test(prefixedNodeName)) {
                  throw new DOMException(
                    'The element name "' + prefixedNodeName + '" is not a valid XML QName',
                    DOMExceptionName.InvalidStateError
                  );
                }
                buf.push("<", prefixedNodeName);
                var childNamespaces = namespaces.slice();
                for (var i2 = 0; i2 < len; i2++) {
                  var attr = attrs.item(i2);
                  if (attr.prefix == "xmlns") {
                    childNamespaces.push({
                      prefix: attr.localName,
                      namespace: attr.value
                    });
                  } else if (attr.nodeName == "xmlns") {
                    childNamespaces.push({ prefix: "", namespace: attr.value });
                  }
                }
                for (var i2 = 0; i2 < len; i2++) {
                  var attr = attrs.item(i2);
                  if (needNamespaceDefine(attr, isHTML, childNamespaces)) {
                    var attrPrefix = attr.prefix || "";
                    var uri = attr.namespaceURI;
                    addSerializedAttribute(buf, attrPrefix ? "xmlns:" + attrPrefix : "xmlns", uri, requireWellFormed);
                    childNamespaces.push({ prefix: attrPrefix, namespace: uri });
                  }
                  var filteredAttr = nodeFilter ? nodeFilter(attr) : attr;
                  if (filteredAttr) {
                    if (typeof filteredAttr === "string") {
                      buf.push(filteredAttr);
                    } else {
                      addSerializedAttribute(buf, filteredAttr.name, filteredAttr.value, requireWellFormed);
                    }
                  }
                }
                if (nodeName === prefixedNodeName && needNamespaceDefine(n, isHTML, childNamespaces)) {
                  var nodePrefix = n.prefix || "";
                  var uri = n.namespaceURI;
                  addSerializedAttribute(buf, nodePrefix ? "xmlns:" + nodePrefix : "xmlns", uri, requireWellFormed);
                  childNamespaces.push({ prefix: nodePrefix, namespace: uri });
                }
                var canCloseTag = !n.firstChild;
                if (canCloseTag && (isHTML || n.namespaceURI === NAMESPACE.HTML)) {
                  canCloseTag = isHTMLVoidElement(nodeName);
                }
                if (canCloseTag) {
                  buf.push("/>");
                  return null;
                }
                buf.push(">");
                if (isHTML && isHTMLRawTextElement(nodeName)) {
                  var child = n.firstChild;
                  while (child) {
                    if (child.data) {
                      buf.push(child.data);
                    } else {
                      serializeToString(child, buf, childNamespaces.slice(), opts);
                    }
                    child = child.nextSibling;
                  }
                  buf.push("</", prefixedNodeName, ">");
                  return null;
                }
                return { ns: childNamespaces, tag: prefixedNodeName };
              case DOCUMENT_NODE:
              case DOCUMENT_FRAGMENT_NODE:
                if (requireWellFormed && n.nodeType === DOCUMENT_NODE && n.documentElement == null) {
                  throw new DOMException("The Document has no documentElement", DOMExceptionName.InvalidStateError);
                }
                return { ns: namespaces };
              case ATTRIBUTE_NODE:
                addSerializedAttribute(buf, n.name, n.value, requireWellFormed);
                return null;
              case TEXT_NODE:
                if (requireWellFormed && g.InvalidChar.test(n.data)) {
                  throw new DOMException(
                    "The Text node data contains characters outside the XML Char production",
                    DOMExceptionName.InvalidStateError
                  );
                }
                buf.push(n.data.replace(/[<&>]/g, _xmlEncoder));
                return null;
              case CDATA_SECTION_NODE:
                if (requireWellFormed && n.data.indexOf("]]>") !== -1) {
                  throw new DOMException('The CDATASection data contains "]]>"', DOMExceptionName.InvalidStateError);
                }
                if (splitCDATASections) {
                  buf.push(g.CDATA_START, n.data.replace(/]]>/g, "]]]]><![CDATA[>"), g.CDATA_END);
                } else {
                  buf.push(g.CDATA_START, n.data, g.CDATA_END);
                }
                return null;
              case COMMENT_NODE:
                if (requireWellFormed) {
                  if (g.InvalidChar.test(n.data)) {
                    throw new DOMException(
                      "The comment node data contains characters outside the XML Char production",
                      DOMExceptionName.InvalidStateError
                    );
                  }
                  if (n.data.indexOf("--") !== -1 || n.data[n.data.length - 1] === "-") {
                    throw new DOMException(
                      'The comment node data contains "--" or ends with "-"',
                      DOMExceptionName.InvalidStateError
                    );
                  }
                }
                buf.push(g.COMMENT_START, n.data, g.COMMENT_END);
                return null;
              case DOCUMENT_TYPE_NODE:
                var pubid = n.publicId;
                var sysid = n.systemId;
                if (requireWellFormed) {
                  if (!g.Name_exact.test(n.name)) {
                    throw new DOMException(
                      'The doctype name "' + n.name + '" is not a valid XML Name',
                      DOMExceptionName.InvalidStateError
                    );
                  }
                  if (pubid && !g.PubidLiteral_match.test(pubid)) {
                    throw new DOMException("DocumentType publicId is not a valid PubidLiteral", DOMExceptionName.InvalidStateError);
                  }
                  if (sysid && sysid !== "." && !g.SystemLiteral_match.test(sysid)) {
                    throw new DOMException("DocumentType systemId is not a valid SystemLiteral", DOMExceptionName.InvalidStateError);
                  }
                  if (n.internalSubset && n.internalSubset.indexOf("]>") !== -1) {
                    throw new DOMException('DocumentType internalSubset contains "]>"', DOMExceptionName.InvalidStateError);
                  }
                }
                buf.push(g.DOCTYPE_DECL_START, " ", n.name);
                if (pubid) {
                  buf.push(" ", g.PUBLIC, " ", pubid);
                  if (sysid && sysid !== ".") {
                    buf.push(" ", sysid);
                  }
                } else if (sysid && sysid !== ".") {
                  buf.push(" ", g.SYSTEM, " ", sysid);
                }
                if (n.internalSubset) {
                  buf.push(" [", n.internalSubset, "]");
                }
                buf.push(">");
                return null;
              case PROCESSING_INSTRUCTION_NODE:
                if (requireWellFormed) {
                  if (!g.NCName_exact.test(n.target) || n.target.toLowerCase() === "xml") {
                    throw new DOMException(
                      'The processing instruction target "' + n.target + '" is not a valid XML NCName or is reserved',
                      DOMExceptionName.InvalidStateError
                    );
                  }
                  if (g.InvalidChar.test(n.data)) {
                    throw new DOMException(
                      "The ProcessingInstruction data contains characters outside the XML Char production",
                      DOMExceptionName.InvalidStateError
                    );
                  }
                  if (n.data.indexOf("?>") !== -1) {
                    throw new DOMException('The ProcessingInstruction data contains "?>"', DOMExceptionName.InvalidStateError);
                  }
                }
                buf.push("<?", n.target, " ", n.data, "?>");
                return null;
              case ENTITY_REFERENCE_NODE:
                if (requireWellFormed && !g.Name_exact.test(n.nodeName)) {
                  throw new DOMException(
                    'The entity reference name "' + n.nodeName + '" is not a valid XML Name',
                    DOMExceptionName.InvalidStateError
                  );
                }
                buf.push("&", n.nodeName, ";");
                return null;
              //case ENTITY_NODE:
              //case NOTATION_NODE:
              default:
                buf.push("??", n.nodeName);
                return null;
            }
          },
          exit: function(n, childCtx) {
            if (childCtx && childCtx.tag) {
              buf.push("</", childCtx.tag, ">");
            }
          }
        }
      );
    }
    function importNode(doc, node, deep) {
      var destRoot;
      walkDOM(node, null, {
        enter: function(srcNode, destParent) {
          var destNode = srcNode.cloneNode(false);
          destNode.ownerDocument = doc;
          destNode.parentNode = null;
          if (destParent === null) {
            destRoot = destNode;
          } else {
            destParent.appendChild(destNode);
          }
          var shouldDeep = srcNode.nodeType === ATTRIBUTE_NODE || deep;
          return shouldDeep ? destNode : null;
        }
      });
      return destRoot;
    }
    function cloneNode(doc, node, deep) {
      var destRoot;
      walkDOM(node, null, {
        enter: function(srcNode, destParent) {
          var destNode = new srcNode.constructor(PDC);
          for (var n in srcNode) {
            if (hasOwn(srcNode, n)) {
              var v = srcNode[n];
              if (typeof v != "object") {
                if (v != destNode[n]) {
                  destNode[n] = v;
                }
              }
            }
          }
          if (srcNode.childNodes) {
            destNode.childNodes = new NodeList();
          }
          destNode.ownerDocument = doc;
          var shouldDeep = deep;
          switch (destNode.nodeType) {
            case ELEMENT_NODE:
              var attrs = srcNode.attributes;
              var attrs2 = destNode.attributes = new NamedNodeMap();
              var len = attrs.length;
              attrs2._ownerElement = destNode;
              for (var i2 = 0; i2 < len; i2++) {
                destNode.setAttributeNode(cloneNode(doc, attrs.item(i2), true));
              }
              break;
            case ATTRIBUTE_NODE:
              shouldDeep = true;
          }
          if (destParent !== null) {
            destParent.appendChild(destNode);
          } else {
            destRoot = destNode;
          }
          return shouldDeep ? destNode : null;
        }
      });
      return destRoot;
    }
    function __set__(object, key2, value) {
      object[key2] = value;
    }
    function childrenRefresh(node) {
      var ls = [];
      var child = node.firstChild;
      while (child) {
        if (child.nodeType === ELEMENT_NODE) {
          ls.push(child);
        }
        child = child.nextSibling;
      }
      return ls;
    }
    try {
      if (Object.defineProperty) {
        Object.defineProperty(LiveNodeList.prototype, "length", {
          get: function() {
            _updateLiveList(this);
            return this.$$length;
          }
        });
        Object.defineProperty(Node.prototype, "textContent", {
          get: function() {
            if (this.nodeType === ELEMENT_NODE || this.nodeType === DOCUMENT_FRAGMENT_NODE) {
              var buf = [];
              walkDOM(this, null, {
                enter: function(n) {
                  if (n.nodeType === ELEMENT_NODE || n.nodeType === DOCUMENT_FRAGMENT_NODE) {
                    return true;
                  }
                  if (n.nodeType === PROCESSING_INSTRUCTION_NODE || n.nodeType === COMMENT_NODE) {
                    return null;
                  }
                  buf.push(n.nodeValue);
                }
              });
              return buf.join("");
            }
            return this.nodeValue;
          },
          set: function(data) {
            switch (this.nodeType) {
              case ELEMENT_NODE:
              case DOCUMENT_FRAGMENT_NODE:
                while (this.firstChild) {
                  this.removeChild(this.firstChild);
                }
                if (data || String(data)) {
                  this.appendChild(this.ownerDocument.createTextNode(data));
                }
                break;
              default:
                this.data = data;
                this.value = data;
                this.nodeValue = data;
            }
          }
        });
        Object.defineProperty(CharacterData.prototype, "data", {
          get: function() {
            return this._data != null ? this._data : "";
          },
          set: function(v) {
            this._data = v;
            this.length = typeof v === "string" ? v.length : 0;
          }
        });
        Object.defineProperty(CharacterData.prototype, "nodeValue", {
          get: function() {
            return this.data;
          },
          set: function(v) {
            this.data = v;
          },
          enumerable: true,
          configurable: true
        });
        Object.defineProperty(Element.prototype, "children", {
          get: function() {
            return new LiveNodeList(this, childrenRefresh);
          }
        });
        Object.defineProperty(Document.prototype, "children", {
          get: function() {
            return new LiveNodeList(this, childrenRefresh);
          }
        });
        Object.defineProperty(DocumentFragment.prototype, "children", {
          get: function() {
            return new LiveNodeList(this, childrenRefresh);
          }
        });
        __set__ = function(object, key2, value) {
          object["$$" + key2] = value;
        };
      }
    } catch (e) {
    }
    exports2._updateLiveList = _updateLiveList;
    exports2.Attr = Attr;
    exports2.CDATASection = CDATASection;
    exports2.CharacterData = CharacterData;
    exports2.Comment = Comment;
    exports2.Document = Document;
    exports2.DocumentFragment = DocumentFragment;
    exports2.DocumentType = DocumentType;
    exports2.DOMImplementation = DOMImplementation;
    exports2.Element = Element;
    exports2.Entity = Entity;
    exports2.EntityReference = EntityReference;
    exports2.LiveNodeList = LiveNodeList;
    exports2.NamedNodeMap = NamedNodeMap;
    exports2.Node = Node;
    exports2.NodeList = NodeList;
    exports2.Notation = Notation;
    exports2.Text = Text;
    exports2.ProcessingInstruction = ProcessingInstruction;
    exports2.walkDOM = walkDOM;
    exports2.XMLSerializer = XMLSerializer;
  }
});

// node_modules/@xmldom/xmldom/lib/entities.js
var require_entities = __commonJS({
  "node_modules/@xmldom/xmldom/lib/entities.js"(exports2) {
    "use strict";
    var freeze = require_conventions().freeze;
    exports2.XML_ENTITIES = freeze({
      amp: "&",
      apos: "'",
      gt: ">",
      lt: "<",
      quot: '"'
    });
    exports2.HTML_ENTITIES = freeze({
      Aacute: "\xC1",
      aacute: "\xE1",
      Abreve: "\u0102",
      abreve: "\u0103",
      ac: "\u223E",
      acd: "\u223F",
      acE: "\u223E\u0333",
      Acirc: "\xC2",
      acirc: "\xE2",
      acute: "\xB4",
      Acy: "\u0410",
      acy: "\u0430",
      AElig: "\xC6",
      aelig: "\xE6",
      af: "\u2061",
      Afr: "\u{1D504}",
      afr: "\u{1D51E}",
      Agrave: "\xC0",
      agrave: "\xE0",
      alefsym: "\u2135",
      aleph: "\u2135",
      Alpha: "\u0391",
      alpha: "\u03B1",
      Amacr: "\u0100",
      amacr: "\u0101",
      amalg: "\u2A3F",
      AMP: "&",
      amp: "&",
      And: "\u2A53",
      and: "\u2227",
      andand: "\u2A55",
      andd: "\u2A5C",
      andslope: "\u2A58",
      andv: "\u2A5A",
      ang: "\u2220",
      ange: "\u29A4",
      angle: "\u2220",
      angmsd: "\u2221",
      angmsdaa: "\u29A8",
      angmsdab: "\u29A9",
      angmsdac: "\u29AA",
      angmsdad: "\u29AB",
      angmsdae: "\u29AC",
      angmsdaf: "\u29AD",
      angmsdag: "\u29AE",
      angmsdah: "\u29AF",
      angrt: "\u221F",
      angrtvb: "\u22BE",
      angrtvbd: "\u299D",
      angsph: "\u2222",
      angst: "\xC5",
      angzarr: "\u237C",
      Aogon: "\u0104",
      aogon: "\u0105",
      Aopf: "\u{1D538}",
      aopf: "\u{1D552}",
      ap: "\u2248",
      apacir: "\u2A6F",
      apE: "\u2A70",
      ape: "\u224A",
      apid: "\u224B",
      apos: "'",
      ApplyFunction: "\u2061",
      approx: "\u2248",
      approxeq: "\u224A",
      Aring: "\xC5",
      aring: "\xE5",
      Ascr: "\u{1D49C}",
      ascr: "\u{1D4B6}",
      Assign: "\u2254",
      ast: "*",
      asymp: "\u2248",
      asympeq: "\u224D",
      Atilde: "\xC3",
      atilde: "\xE3",
      Auml: "\xC4",
      auml: "\xE4",
      awconint: "\u2233",
      awint: "\u2A11",
      backcong: "\u224C",
      backepsilon: "\u03F6",
      backprime: "\u2035",
      backsim: "\u223D",
      backsimeq: "\u22CD",
      Backslash: "\u2216",
      Barv: "\u2AE7",
      barvee: "\u22BD",
      Barwed: "\u2306",
      barwed: "\u2305",
      barwedge: "\u2305",
      bbrk: "\u23B5",
      bbrktbrk: "\u23B6",
      bcong: "\u224C",
      Bcy: "\u0411",
      bcy: "\u0431",
      bdquo: "\u201E",
      becaus: "\u2235",
      Because: "\u2235",
      because: "\u2235",
      bemptyv: "\u29B0",
      bepsi: "\u03F6",
      bernou: "\u212C",
      Bernoullis: "\u212C",
      Beta: "\u0392",
      beta: "\u03B2",
      beth: "\u2136",
      between: "\u226C",
      Bfr: "\u{1D505}",
      bfr: "\u{1D51F}",
      bigcap: "\u22C2",
      bigcirc: "\u25EF",
      bigcup: "\u22C3",
      bigodot: "\u2A00",
      bigoplus: "\u2A01",
      bigotimes: "\u2A02",
      bigsqcup: "\u2A06",
      bigstar: "\u2605",
      bigtriangledown: "\u25BD",
      bigtriangleup: "\u25B3",
      biguplus: "\u2A04",
      bigvee: "\u22C1",
      bigwedge: "\u22C0",
      bkarow: "\u290D",
      blacklozenge: "\u29EB",
      blacksquare: "\u25AA",
      blacktriangle: "\u25B4",
      blacktriangledown: "\u25BE",
      blacktriangleleft: "\u25C2",
      blacktriangleright: "\u25B8",
      blank: "\u2423",
      blk12: "\u2592",
      blk14: "\u2591",
      blk34: "\u2593",
      block: "\u2588",
      bne: "=\u20E5",
      bnequiv: "\u2261\u20E5",
      bNot: "\u2AED",
      bnot: "\u2310",
      Bopf: "\u{1D539}",
      bopf: "\u{1D553}",
      bot: "\u22A5",
      bottom: "\u22A5",
      bowtie: "\u22C8",
      boxbox: "\u29C9",
      boxDL: "\u2557",
      boxDl: "\u2556",
      boxdL: "\u2555",
      boxdl: "\u2510",
      boxDR: "\u2554",
      boxDr: "\u2553",
      boxdR: "\u2552",
      boxdr: "\u250C",
      boxH: "\u2550",
      boxh: "\u2500",
      boxHD: "\u2566",
      boxHd: "\u2564",
      boxhD: "\u2565",
      boxhd: "\u252C",
      boxHU: "\u2569",
      boxHu: "\u2567",
      boxhU: "\u2568",
      boxhu: "\u2534",
      boxminus: "\u229F",
      boxplus: "\u229E",
      boxtimes: "\u22A0",
      boxUL: "\u255D",
      boxUl: "\u255C",
      boxuL: "\u255B",
      boxul: "\u2518",
      boxUR: "\u255A",
      boxUr: "\u2559",
      boxuR: "\u2558",
      boxur: "\u2514",
      boxV: "\u2551",
      boxv: "\u2502",
      boxVH: "\u256C",
      boxVh: "\u256B",
      boxvH: "\u256A",
      boxvh: "\u253C",
      boxVL: "\u2563",
      boxVl: "\u2562",
      boxvL: "\u2561",
      boxvl: "\u2524",
      boxVR: "\u2560",
      boxVr: "\u255F",
      boxvR: "\u255E",
      boxvr: "\u251C",
      bprime: "\u2035",
      Breve: "\u02D8",
      breve: "\u02D8",
      brvbar: "\xA6",
      Bscr: "\u212C",
      bscr: "\u{1D4B7}",
      bsemi: "\u204F",
      bsim: "\u223D",
      bsime: "\u22CD",
      bsol: "\\",
      bsolb: "\u29C5",
      bsolhsub: "\u27C8",
      bull: "\u2022",
      bullet: "\u2022",
      bump: "\u224E",
      bumpE: "\u2AAE",
      bumpe: "\u224F",
      Bumpeq: "\u224E",
      bumpeq: "\u224F",
      Cacute: "\u0106",
      cacute: "\u0107",
      Cap: "\u22D2",
      cap: "\u2229",
      capand: "\u2A44",
      capbrcup: "\u2A49",
      capcap: "\u2A4B",
      capcup: "\u2A47",
      capdot: "\u2A40",
      CapitalDifferentialD: "\u2145",
      caps: "\u2229\uFE00",
      caret: "\u2041",
      caron: "\u02C7",
      Cayleys: "\u212D",
      ccaps: "\u2A4D",
      Ccaron: "\u010C",
      ccaron: "\u010D",
      Ccedil: "\xC7",
      ccedil: "\xE7",
      Ccirc: "\u0108",
      ccirc: "\u0109",
      Cconint: "\u2230",
      ccups: "\u2A4C",
      ccupssm: "\u2A50",
      Cdot: "\u010A",
      cdot: "\u010B",
      cedil: "\xB8",
      Cedilla: "\xB8",
      cemptyv: "\u29B2",
      cent: "\xA2",
      CenterDot: "\xB7",
      centerdot: "\xB7",
      Cfr: "\u212D",
      cfr: "\u{1D520}",
      CHcy: "\u0427",
      chcy: "\u0447",
      check: "\u2713",
      checkmark: "\u2713",
      Chi: "\u03A7",
      chi: "\u03C7",
      cir: "\u25CB",
      circ: "\u02C6",
      circeq: "\u2257",
      circlearrowleft: "\u21BA",
      circlearrowright: "\u21BB",
      circledast: "\u229B",
      circledcirc: "\u229A",
      circleddash: "\u229D",
      CircleDot: "\u2299",
      circledR: "\xAE",
      circledS: "\u24C8",
      CircleMinus: "\u2296",
      CirclePlus: "\u2295",
      CircleTimes: "\u2297",
      cirE: "\u29C3",
      cire: "\u2257",
      cirfnint: "\u2A10",
      cirmid: "\u2AEF",
      cirscir: "\u29C2",
      ClockwiseContourIntegral: "\u2232",
      CloseCurlyDoubleQuote: "\u201D",
      CloseCurlyQuote: "\u2019",
      clubs: "\u2663",
      clubsuit: "\u2663",
      Colon: "\u2237",
      colon: ":",
      Colone: "\u2A74",
      colone: "\u2254",
      coloneq: "\u2254",
      comma: ",",
      commat: "@",
      comp: "\u2201",
      compfn: "\u2218",
      complement: "\u2201",
      complexes: "\u2102",
      cong: "\u2245",
      congdot: "\u2A6D",
      Congruent: "\u2261",
      Conint: "\u222F",
      conint: "\u222E",
      ContourIntegral: "\u222E",
      Copf: "\u2102",
      copf: "\u{1D554}",
      coprod: "\u2210",
      Coproduct: "\u2210",
      COPY: "\xA9",
      copy: "\xA9",
      copysr: "\u2117",
      CounterClockwiseContourIntegral: "\u2233",
      crarr: "\u21B5",
      Cross: "\u2A2F",
      cross: "\u2717",
      Cscr: "\u{1D49E}",
      cscr: "\u{1D4B8}",
      csub: "\u2ACF",
      csube: "\u2AD1",
      csup: "\u2AD0",
      csupe: "\u2AD2",
      ctdot: "\u22EF",
      cudarrl: "\u2938",
      cudarrr: "\u2935",
      cuepr: "\u22DE",
      cuesc: "\u22DF",
      cularr: "\u21B6",
      cularrp: "\u293D",
      Cup: "\u22D3",
      cup: "\u222A",
      cupbrcap: "\u2A48",
      CupCap: "\u224D",
      cupcap: "\u2A46",
      cupcup: "\u2A4A",
      cupdot: "\u228D",
      cupor: "\u2A45",
      cups: "\u222A\uFE00",
      curarr: "\u21B7",
      curarrm: "\u293C",
      curlyeqprec: "\u22DE",
      curlyeqsucc: "\u22DF",
      curlyvee: "\u22CE",
      curlywedge: "\u22CF",
      curren: "\xA4",
      curvearrowleft: "\u21B6",
      curvearrowright: "\u21B7",
      cuvee: "\u22CE",
      cuwed: "\u22CF",
      cwconint: "\u2232",
      cwint: "\u2231",
      cylcty: "\u232D",
      Dagger: "\u2021",
      dagger: "\u2020",
      daleth: "\u2138",
      Darr: "\u21A1",
      dArr: "\u21D3",
      darr: "\u2193",
      dash: "\u2010",
      Dashv: "\u2AE4",
      dashv: "\u22A3",
      dbkarow: "\u290F",
      dblac: "\u02DD",
      Dcaron: "\u010E",
      dcaron: "\u010F",
      Dcy: "\u0414",
      dcy: "\u0434",
      DD: "\u2145",
      dd: "\u2146",
      ddagger: "\u2021",
      ddarr: "\u21CA",
      DDotrahd: "\u2911",
      ddotseq: "\u2A77",
      deg: "\xB0",
      Del: "\u2207",
      Delta: "\u0394",
      delta: "\u03B4",
      demptyv: "\u29B1",
      dfisht: "\u297F",
      Dfr: "\u{1D507}",
      dfr: "\u{1D521}",
      dHar: "\u2965",
      dharl: "\u21C3",
      dharr: "\u21C2",
      DiacriticalAcute: "\xB4",
      DiacriticalDot: "\u02D9",
      DiacriticalDoubleAcute: "\u02DD",
      DiacriticalGrave: "`",
      DiacriticalTilde: "\u02DC",
      diam: "\u22C4",
      Diamond: "\u22C4",
      diamond: "\u22C4",
      diamondsuit: "\u2666",
      diams: "\u2666",
      die: "\xA8",
      DifferentialD: "\u2146",
      digamma: "\u03DD",
      disin: "\u22F2",
      div: "\xF7",
      divide: "\xF7",
      divideontimes: "\u22C7",
      divonx: "\u22C7",
      DJcy: "\u0402",
      djcy: "\u0452",
      dlcorn: "\u231E",
      dlcrop: "\u230D",
      dollar: "$",
      Dopf: "\u{1D53B}",
      dopf: "\u{1D555}",
      Dot: "\xA8",
      dot: "\u02D9",
      DotDot: "\u20DC",
      doteq: "\u2250",
      doteqdot: "\u2251",
      DotEqual: "\u2250",
      dotminus: "\u2238",
      dotplus: "\u2214",
      dotsquare: "\u22A1",
      doublebarwedge: "\u2306",
      DoubleContourIntegral: "\u222F",
      DoubleDot: "\xA8",
      DoubleDownArrow: "\u21D3",
      DoubleLeftArrow: "\u21D0",
      DoubleLeftRightArrow: "\u21D4",
      DoubleLeftTee: "\u2AE4",
      DoubleLongLeftArrow: "\u27F8",
      DoubleLongLeftRightArrow: "\u27FA",
      DoubleLongRightArrow: "\u27F9",
      DoubleRightArrow: "\u21D2",
      DoubleRightTee: "\u22A8",
      DoubleUpArrow: "\u21D1",
      DoubleUpDownArrow: "\u21D5",
      DoubleVerticalBar: "\u2225",
      DownArrow: "\u2193",
      Downarrow: "\u21D3",
      downarrow: "\u2193",
      DownArrowBar: "\u2913",
      DownArrowUpArrow: "\u21F5",
      DownBreve: "\u0311",
      downdownarrows: "\u21CA",
      downharpoonleft: "\u21C3",
      downharpoonright: "\u21C2",
      DownLeftRightVector: "\u2950",
      DownLeftTeeVector: "\u295E",
      DownLeftVector: "\u21BD",
      DownLeftVectorBar: "\u2956",
      DownRightTeeVector: "\u295F",
      DownRightVector: "\u21C1",
      DownRightVectorBar: "\u2957",
      DownTee: "\u22A4",
      DownTeeArrow: "\u21A7",
      drbkarow: "\u2910",
      drcorn: "\u231F",
      drcrop: "\u230C",
      Dscr: "\u{1D49F}",
      dscr: "\u{1D4B9}",
      DScy: "\u0405",
      dscy: "\u0455",
      dsol: "\u29F6",
      Dstrok: "\u0110",
      dstrok: "\u0111",
      dtdot: "\u22F1",
      dtri: "\u25BF",
      dtrif: "\u25BE",
      duarr: "\u21F5",
      duhar: "\u296F",
      dwangle: "\u29A6",
      DZcy: "\u040F",
      dzcy: "\u045F",
      dzigrarr: "\u27FF",
      Eacute: "\xC9",
      eacute: "\xE9",
      easter: "\u2A6E",
      Ecaron: "\u011A",
      ecaron: "\u011B",
      ecir: "\u2256",
      Ecirc: "\xCA",
      ecirc: "\xEA",
      ecolon: "\u2255",
      Ecy: "\u042D",
      ecy: "\u044D",
      eDDot: "\u2A77",
      Edot: "\u0116",
      eDot: "\u2251",
      edot: "\u0117",
      ee: "\u2147",
      efDot: "\u2252",
      Efr: "\u{1D508}",
      efr: "\u{1D522}",
      eg: "\u2A9A",
      Egrave: "\xC8",
      egrave: "\xE8",
      egs: "\u2A96",
      egsdot: "\u2A98",
      el: "\u2A99",
      Element: "\u2208",
      elinters: "\u23E7",
      ell: "\u2113",
      els: "\u2A95",
      elsdot: "\u2A97",
      Emacr: "\u0112",
      emacr: "\u0113",
      empty: "\u2205",
      emptyset: "\u2205",
      EmptySmallSquare: "\u25FB",
      emptyv: "\u2205",
      EmptyVerySmallSquare: "\u25AB",
      emsp: "\u2003",
      emsp13: "\u2004",
      emsp14: "\u2005",
      ENG: "\u014A",
      eng: "\u014B",
      ensp: "\u2002",
      Eogon: "\u0118",
      eogon: "\u0119",
      Eopf: "\u{1D53C}",
      eopf: "\u{1D556}",
      epar: "\u22D5",
      eparsl: "\u29E3",
      eplus: "\u2A71",
      epsi: "\u03B5",
      Epsilon: "\u0395",
      epsilon: "\u03B5",
      epsiv: "\u03F5",
      eqcirc: "\u2256",
      eqcolon: "\u2255",
      eqsim: "\u2242",
      eqslantgtr: "\u2A96",
      eqslantless: "\u2A95",
      Equal: "\u2A75",
      equals: "=",
      EqualTilde: "\u2242",
      equest: "\u225F",
      Equilibrium: "\u21CC",
      equiv: "\u2261",
      equivDD: "\u2A78",
      eqvparsl: "\u29E5",
      erarr: "\u2971",
      erDot: "\u2253",
      Escr: "\u2130",
      escr: "\u212F",
      esdot: "\u2250",
      Esim: "\u2A73",
      esim: "\u2242",
      Eta: "\u0397",
      eta: "\u03B7",
      ETH: "\xD0",
      eth: "\xF0",
      Euml: "\xCB",
      euml: "\xEB",
      euro: "\u20AC",
      excl: "!",
      exist: "\u2203",
      Exists: "\u2203",
      expectation: "\u2130",
      ExponentialE: "\u2147",
      exponentiale: "\u2147",
      fallingdotseq: "\u2252",
      Fcy: "\u0424",
      fcy: "\u0444",
      female: "\u2640",
      ffilig: "\uFB03",
      fflig: "\uFB00",
      ffllig: "\uFB04",
      Ffr: "\u{1D509}",
      ffr: "\u{1D523}",
      filig: "\uFB01",
      FilledSmallSquare: "\u25FC",
      FilledVerySmallSquare: "\u25AA",
      fjlig: "fj",
      flat: "\u266D",
      fllig: "\uFB02",
      fltns: "\u25B1",
      fnof: "\u0192",
      Fopf: "\u{1D53D}",
      fopf: "\u{1D557}",
      ForAll: "\u2200",
      forall: "\u2200",
      fork: "\u22D4",
      forkv: "\u2AD9",
      Fouriertrf: "\u2131",
      fpartint: "\u2A0D",
      frac12: "\xBD",
      frac13: "\u2153",
      frac14: "\xBC",
      frac15: "\u2155",
      frac16: "\u2159",
      frac18: "\u215B",
      frac23: "\u2154",
      frac25: "\u2156",
      frac34: "\xBE",
      frac35: "\u2157",
      frac38: "\u215C",
      frac45: "\u2158",
      frac56: "\u215A",
      frac58: "\u215D",
      frac78: "\u215E",
      frasl: "\u2044",
      frown: "\u2322",
      Fscr: "\u2131",
      fscr: "\u{1D4BB}",
      gacute: "\u01F5",
      Gamma: "\u0393",
      gamma: "\u03B3",
      Gammad: "\u03DC",
      gammad: "\u03DD",
      gap: "\u2A86",
      Gbreve: "\u011E",
      gbreve: "\u011F",
      Gcedil: "\u0122",
      Gcirc: "\u011C",
      gcirc: "\u011D",
      Gcy: "\u0413",
      gcy: "\u0433",
      Gdot: "\u0120",
      gdot: "\u0121",
      gE: "\u2267",
      ge: "\u2265",
      gEl: "\u2A8C",
      gel: "\u22DB",
      geq: "\u2265",
      geqq: "\u2267",
      geqslant: "\u2A7E",
      ges: "\u2A7E",
      gescc: "\u2AA9",
      gesdot: "\u2A80",
      gesdoto: "\u2A82",
      gesdotol: "\u2A84",
      gesl: "\u22DB\uFE00",
      gesles: "\u2A94",
      Gfr: "\u{1D50A}",
      gfr: "\u{1D524}",
      Gg: "\u22D9",
      gg: "\u226B",
      ggg: "\u22D9",
      gimel: "\u2137",
      GJcy: "\u0403",
      gjcy: "\u0453",
      gl: "\u2277",
      gla: "\u2AA5",
      glE: "\u2A92",
      glj: "\u2AA4",
      gnap: "\u2A8A",
      gnapprox: "\u2A8A",
      gnE: "\u2269",
      gne: "\u2A88",
      gneq: "\u2A88",
      gneqq: "\u2269",
      gnsim: "\u22E7",
      Gopf: "\u{1D53E}",
      gopf: "\u{1D558}",
      grave: "`",
      GreaterEqual: "\u2265",
      GreaterEqualLess: "\u22DB",
      GreaterFullEqual: "\u2267",
      GreaterGreater: "\u2AA2",
      GreaterLess: "\u2277",
      GreaterSlantEqual: "\u2A7E",
      GreaterTilde: "\u2273",
      Gscr: "\u{1D4A2}",
      gscr: "\u210A",
      gsim: "\u2273",
      gsime: "\u2A8E",
      gsiml: "\u2A90",
      Gt: "\u226B",
      GT: ">",
      gt: ">",
      gtcc: "\u2AA7",
      gtcir: "\u2A7A",
      gtdot: "\u22D7",
      gtlPar: "\u2995",
      gtquest: "\u2A7C",
      gtrapprox: "\u2A86",
      gtrarr: "\u2978",
      gtrdot: "\u22D7",
      gtreqless: "\u22DB",
      gtreqqless: "\u2A8C",
      gtrless: "\u2277",
      gtrsim: "\u2273",
      gvertneqq: "\u2269\uFE00",
      gvnE: "\u2269\uFE00",
      Hacek: "\u02C7",
      hairsp: "\u200A",
      half: "\xBD",
      hamilt: "\u210B",
      HARDcy: "\u042A",
      hardcy: "\u044A",
      hArr: "\u21D4",
      harr: "\u2194",
      harrcir: "\u2948",
      harrw: "\u21AD",
      Hat: "^",
      hbar: "\u210F",
      Hcirc: "\u0124",
      hcirc: "\u0125",
      hearts: "\u2665",
      heartsuit: "\u2665",
      hellip: "\u2026",
      hercon: "\u22B9",
      Hfr: "\u210C",
      hfr: "\u{1D525}",
      HilbertSpace: "\u210B",
      hksearow: "\u2925",
      hkswarow: "\u2926",
      hoarr: "\u21FF",
      homtht: "\u223B",
      hookleftarrow: "\u21A9",
      hookrightarrow: "\u21AA",
      Hopf: "\u210D",
      hopf: "\u{1D559}",
      horbar: "\u2015",
      HorizontalLine: "\u2500",
      Hscr: "\u210B",
      hscr: "\u{1D4BD}",
      hslash: "\u210F",
      Hstrok: "\u0126",
      hstrok: "\u0127",
      HumpDownHump: "\u224E",
      HumpEqual: "\u224F",
      hybull: "\u2043",
      hyphen: "\u2010",
      Iacute: "\xCD",
      iacute: "\xED",
      ic: "\u2063",
      Icirc: "\xCE",
      icirc: "\xEE",
      Icy: "\u0418",
      icy: "\u0438",
      Idot: "\u0130",
      IEcy: "\u0415",
      iecy: "\u0435",
      iexcl: "\xA1",
      iff: "\u21D4",
      Ifr: "\u2111",
      ifr: "\u{1D526}",
      Igrave: "\xCC",
      igrave: "\xEC",
      ii: "\u2148",
      iiiint: "\u2A0C",
      iiint: "\u222D",
      iinfin: "\u29DC",
      iiota: "\u2129",
      IJlig: "\u0132",
      ijlig: "\u0133",
      Im: "\u2111",
      Imacr: "\u012A",
      imacr: "\u012B",
      image: "\u2111",
      ImaginaryI: "\u2148",
      imagline: "\u2110",
      imagpart: "\u2111",
      imath: "\u0131",
      imof: "\u22B7",
      imped: "\u01B5",
      Implies: "\u21D2",
      in: "\u2208",
      incare: "\u2105",
      infin: "\u221E",
      infintie: "\u29DD",
      inodot: "\u0131",
      Int: "\u222C",
      int: "\u222B",
      intcal: "\u22BA",
      integers: "\u2124",
      Integral: "\u222B",
      intercal: "\u22BA",
      Intersection: "\u22C2",
      intlarhk: "\u2A17",
      intprod: "\u2A3C",
      InvisibleComma: "\u2063",
      InvisibleTimes: "\u2062",
      IOcy: "\u0401",
      iocy: "\u0451",
      Iogon: "\u012E",
      iogon: "\u012F",
      Iopf: "\u{1D540}",
      iopf: "\u{1D55A}",
      Iota: "\u0399",
      iota: "\u03B9",
      iprod: "\u2A3C",
      iquest: "\xBF",
      Iscr: "\u2110",
      iscr: "\u{1D4BE}",
      isin: "\u2208",
      isindot: "\u22F5",
      isinE: "\u22F9",
      isins: "\u22F4",
      isinsv: "\u22F3",
      isinv: "\u2208",
      it: "\u2062",
      Itilde: "\u0128",
      itilde: "\u0129",
      Iukcy: "\u0406",
      iukcy: "\u0456",
      Iuml: "\xCF",
      iuml: "\xEF",
      Jcirc: "\u0134",
      jcirc: "\u0135",
      Jcy: "\u0419",
      jcy: "\u0439",
      Jfr: "\u{1D50D}",
      jfr: "\u{1D527}",
      jmath: "\u0237",
      Jopf: "\u{1D541}",
      jopf: "\u{1D55B}",
      Jscr: "\u{1D4A5}",
      jscr: "\u{1D4BF}",
      Jsercy: "\u0408",
      jsercy: "\u0458",
      Jukcy: "\u0404",
      jukcy: "\u0454",
      Kappa: "\u039A",
      kappa: "\u03BA",
      kappav: "\u03F0",
      Kcedil: "\u0136",
      kcedil: "\u0137",
      Kcy: "\u041A",
      kcy: "\u043A",
      Kfr: "\u{1D50E}",
      kfr: "\u{1D528}",
      kgreen: "\u0138",
      KHcy: "\u0425",
      khcy: "\u0445",
      KJcy: "\u040C",
      kjcy: "\u045C",
      Kopf: "\u{1D542}",
      kopf: "\u{1D55C}",
      Kscr: "\u{1D4A6}",
      kscr: "\u{1D4C0}",
      lAarr: "\u21DA",
      Lacute: "\u0139",
      lacute: "\u013A",
      laemptyv: "\u29B4",
      lagran: "\u2112",
      Lambda: "\u039B",
      lambda: "\u03BB",
      Lang: "\u27EA",
      lang: "\u27E8",
      langd: "\u2991",
      langle: "\u27E8",
      lap: "\u2A85",
      Laplacetrf: "\u2112",
      laquo: "\xAB",
      Larr: "\u219E",
      lArr: "\u21D0",
      larr: "\u2190",
      larrb: "\u21E4",
      larrbfs: "\u291F",
      larrfs: "\u291D",
      larrhk: "\u21A9",
      larrlp: "\u21AB",
      larrpl: "\u2939",
      larrsim: "\u2973",
      larrtl: "\u21A2",
      lat: "\u2AAB",
      lAtail: "\u291B",
      latail: "\u2919",
      late: "\u2AAD",
      lates: "\u2AAD\uFE00",
      lBarr: "\u290E",
      lbarr: "\u290C",
      lbbrk: "\u2772",
      lbrace: "{",
      lbrack: "[",
      lbrke: "\u298B",
      lbrksld: "\u298F",
      lbrkslu: "\u298D",
      Lcaron: "\u013D",
      lcaron: "\u013E",
      Lcedil: "\u013B",
      lcedil: "\u013C",
      lceil: "\u2308",
      lcub: "{",
      Lcy: "\u041B",
      lcy: "\u043B",
      ldca: "\u2936",
      ldquo: "\u201C",
      ldquor: "\u201E",
      ldrdhar: "\u2967",
      ldrushar: "\u294B",
      ldsh: "\u21B2",
      lE: "\u2266",
      le: "\u2264",
      LeftAngleBracket: "\u27E8",
      LeftArrow: "\u2190",
      Leftarrow: "\u21D0",
      leftarrow: "\u2190",
      LeftArrowBar: "\u21E4",
      LeftArrowRightArrow: "\u21C6",
      leftarrowtail: "\u21A2",
      LeftCeiling: "\u2308",
      LeftDoubleBracket: "\u27E6",
      LeftDownTeeVector: "\u2961",
      LeftDownVector: "\u21C3",
      LeftDownVectorBar: "\u2959",
      LeftFloor: "\u230A",
      leftharpoondown: "\u21BD",
      leftharpoonup: "\u21BC",
      leftleftarrows: "\u21C7",
      LeftRightArrow: "\u2194",
      Leftrightarrow: "\u21D4",
      leftrightarrow: "\u2194",
      leftrightarrows: "\u21C6",
      leftrightharpoons: "\u21CB",
      leftrightsquigarrow: "\u21AD",
      LeftRightVector: "\u294E",
      LeftTee: "\u22A3",
      LeftTeeArrow: "\u21A4",
      LeftTeeVector: "\u295A",
      leftthreetimes: "\u22CB",
      LeftTriangle: "\u22B2",
      LeftTriangleBar: "\u29CF",
      LeftTriangleEqual: "\u22B4",
      LeftUpDownVector: "\u2951",
      LeftUpTeeVector: "\u2960",
      LeftUpVector: "\u21BF",
      LeftUpVectorBar: "\u2958",
      LeftVector: "\u21BC",
      LeftVectorBar: "\u2952",
      lEg: "\u2A8B",
      leg: "\u22DA",
      leq: "\u2264",
      leqq: "\u2266",
      leqslant: "\u2A7D",
      les: "\u2A7D",
      lescc: "\u2AA8",
      lesdot: "\u2A7F",
      lesdoto: "\u2A81",
      lesdotor: "\u2A83",
      lesg: "\u22DA\uFE00",
      lesges: "\u2A93",
      lessapprox: "\u2A85",
      lessdot: "\u22D6",
      lesseqgtr: "\u22DA",
      lesseqqgtr: "\u2A8B",
      LessEqualGreater: "\u22DA",
      LessFullEqual: "\u2266",
      LessGreater: "\u2276",
      lessgtr: "\u2276",
      LessLess: "\u2AA1",
      lesssim: "\u2272",
      LessSlantEqual: "\u2A7D",
      LessTilde: "\u2272",
      lfisht: "\u297C",
      lfloor: "\u230A",
      Lfr: "\u{1D50F}",
      lfr: "\u{1D529}",
      lg: "\u2276",
      lgE: "\u2A91",
      lHar: "\u2962",
      lhard: "\u21BD",
      lharu: "\u21BC",
      lharul: "\u296A",
      lhblk: "\u2584",
      LJcy: "\u0409",
      ljcy: "\u0459",
      Ll: "\u22D8",
      ll: "\u226A",
      llarr: "\u21C7",
      llcorner: "\u231E",
      Lleftarrow: "\u21DA",
      llhard: "\u296B",
      lltri: "\u25FA",
      Lmidot: "\u013F",
      lmidot: "\u0140",
      lmoust: "\u23B0",
      lmoustache: "\u23B0",
      lnap: "\u2A89",
      lnapprox: "\u2A89",
      lnE: "\u2268",
      lne: "\u2A87",
      lneq: "\u2A87",
      lneqq: "\u2268",
      lnsim: "\u22E6",
      loang: "\u27EC",
      loarr: "\u21FD",
      lobrk: "\u27E6",
      LongLeftArrow: "\u27F5",
      Longleftarrow: "\u27F8",
      longleftarrow: "\u27F5",
      LongLeftRightArrow: "\u27F7",
      Longleftrightarrow: "\u27FA",
      longleftrightarrow: "\u27F7",
      longmapsto: "\u27FC",
      LongRightArrow: "\u27F6",
      Longrightarrow: "\u27F9",
      longrightarrow: "\u27F6",
      looparrowleft: "\u21AB",
      looparrowright: "\u21AC",
      lopar: "\u2985",
      Lopf: "\u{1D543}",
      lopf: "\u{1D55D}",
      loplus: "\u2A2D",
      lotimes: "\u2A34",
      lowast: "\u2217",
      lowbar: "_",
      LowerLeftArrow: "\u2199",
      LowerRightArrow: "\u2198",
      loz: "\u25CA",
      lozenge: "\u25CA",
      lozf: "\u29EB",
      lpar: "(",
      lparlt: "\u2993",
      lrarr: "\u21C6",
      lrcorner: "\u231F",
      lrhar: "\u21CB",
      lrhard: "\u296D",
      lrm: "\u200E",
      lrtri: "\u22BF",
      lsaquo: "\u2039",
      Lscr: "\u2112",
      lscr: "\u{1D4C1}",
      Lsh: "\u21B0",
      lsh: "\u21B0",
      lsim: "\u2272",
      lsime: "\u2A8D",
      lsimg: "\u2A8F",
      lsqb: "[",
      lsquo: "\u2018",
      lsquor: "\u201A",
      Lstrok: "\u0141",
      lstrok: "\u0142",
      Lt: "\u226A",
      LT: "<",
      lt: "<",
      ltcc: "\u2AA6",
      ltcir: "\u2A79",
      ltdot: "\u22D6",
      lthree: "\u22CB",
      ltimes: "\u22C9",
      ltlarr: "\u2976",
      ltquest: "\u2A7B",
      ltri: "\u25C3",
      ltrie: "\u22B4",
      ltrif: "\u25C2",
      ltrPar: "\u2996",
      lurdshar: "\u294A",
      luruhar: "\u2966",
      lvertneqq: "\u2268\uFE00",
      lvnE: "\u2268\uFE00",
      macr: "\xAF",
      male: "\u2642",
      malt: "\u2720",
      maltese: "\u2720",
      Map: "\u2905",
      map: "\u21A6",
      mapsto: "\u21A6",
      mapstodown: "\u21A7",
      mapstoleft: "\u21A4",
      mapstoup: "\u21A5",
      marker: "\u25AE",
      mcomma: "\u2A29",
      Mcy: "\u041C",
      mcy: "\u043C",
      mdash: "\u2014",
      mDDot: "\u223A",
      measuredangle: "\u2221",
      MediumSpace: "\u205F",
      Mellintrf: "\u2133",
      Mfr: "\u{1D510}",
      mfr: "\u{1D52A}",
      mho: "\u2127",
      micro: "\xB5",
      mid: "\u2223",
      midast: "*",
      midcir: "\u2AF0",
      middot: "\xB7",
      minus: "\u2212",
      minusb: "\u229F",
      minusd: "\u2238",
      minusdu: "\u2A2A",
      MinusPlus: "\u2213",
      mlcp: "\u2ADB",
      mldr: "\u2026",
      mnplus: "\u2213",
      models: "\u22A7",
      Mopf: "\u{1D544}",
      mopf: "\u{1D55E}",
      mp: "\u2213",
      Mscr: "\u2133",
      mscr: "\u{1D4C2}",
      mstpos: "\u223E",
      Mu: "\u039C",
      mu: "\u03BC",
      multimap: "\u22B8",
      mumap: "\u22B8",
      nabla: "\u2207",
      Nacute: "\u0143",
      nacute: "\u0144",
      nang: "\u2220\u20D2",
      nap: "\u2249",
      napE: "\u2A70\u0338",
      napid: "\u224B\u0338",
      napos: "\u0149",
      napprox: "\u2249",
      natur: "\u266E",
      natural: "\u266E",
      naturals: "\u2115",
      nbsp: "\xA0",
      nbump: "\u224E\u0338",
      nbumpe: "\u224F\u0338",
      ncap: "\u2A43",
      Ncaron: "\u0147",
      ncaron: "\u0148",
      Ncedil: "\u0145",
      ncedil: "\u0146",
      ncong: "\u2247",
      ncongdot: "\u2A6D\u0338",
      ncup: "\u2A42",
      Ncy: "\u041D",
      ncy: "\u043D",
      ndash: "\u2013",
      ne: "\u2260",
      nearhk: "\u2924",
      neArr: "\u21D7",
      nearr: "\u2197",
      nearrow: "\u2197",
      nedot: "\u2250\u0338",
      NegativeMediumSpace: "\u200B",
      NegativeThickSpace: "\u200B",
      NegativeThinSpace: "\u200B",
      NegativeVeryThinSpace: "\u200B",
      nequiv: "\u2262",
      nesear: "\u2928",
      nesim: "\u2242\u0338",
      NestedGreaterGreater: "\u226B",
      NestedLessLess: "\u226A",
      NewLine: "\n",
      nexist: "\u2204",
      nexists: "\u2204",
      Nfr: "\u{1D511}",
      nfr: "\u{1D52B}",
      ngE: "\u2267\u0338",
      nge: "\u2271",
      ngeq: "\u2271",
      ngeqq: "\u2267\u0338",
      ngeqslant: "\u2A7E\u0338",
      nges: "\u2A7E\u0338",
      nGg: "\u22D9\u0338",
      ngsim: "\u2275",
      nGt: "\u226B\u20D2",
      ngt: "\u226F",
      ngtr: "\u226F",
      nGtv: "\u226B\u0338",
      nhArr: "\u21CE",
      nharr: "\u21AE",
      nhpar: "\u2AF2",
      ni: "\u220B",
      nis: "\u22FC",
      nisd: "\u22FA",
      niv: "\u220B",
      NJcy: "\u040A",
      njcy: "\u045A",
      nlArr: "\u21CD",
      nlarr: "\u219A",
      nldr: "\u2025",
      nlE: "\u2266\u0338",
      nle: "\u2270",
      nLeftarrow: "\u21CD",
      nleftarrow: "\u219A",
      nLeftrightarrow: "\u21CE",
      nleftrightarrow: "\u21AE",
      nleq: "\u2270",
      nleqq: "\u2266\u0338",
      nleqslant: "\u2A7D\u0338",
      nles: "\u2A7D\u0338",
      nless: "\u226E",
      nLl: "\u22D8\u0338",
      nlsim: "\u2274",
      nLt: "\u226A\u20D2",
      nlt: "\u226E",
      nltri: "\u22EA",
      nltrie: "\u22EC",
      nLtv: "\u226A\u0338",
      nmid: "\u2224",
      NoBreak: "\u2060",
      NonBreakingSpace: "\xA0",
      Nopf: "\u2115",
      nopf: "\u{1D55F}",
      Not: "\u2AEC",
      not: "\xAC",
      NotCongruent: "\u2262",
      NotCupCap: "\u226D",
      NotDoubleVerticalBar: "\u2226",
      NotElement: "\u2209",
      NotEqual: "\u2260",
      NotEqualTilde: "\u2242\u0338",
      NotExists: "\u2204",
      NotGreater: "\u226F",
      NotGreaterEqual: "\u2271",
      NotGreaterFullEqual: "\u2267\u0338",
      NotGreaterGreater: "\u226B\u0338",
      NotGreaterLess: "\u2279",
      NotGreaterSlantEqual: "\u2A7E\u0338",
      NotGreaterTilde: "\u2275",
      NotHumpDownHump: "\u224E\u0338",
      NotHumpEqual: "\u224F\u0338",
      notin: "\u2209",
      notindot: "\u22F5\u0338",
      notinE: "\u22F9\u0338",
      notinva: "\u2209",
      notinvb: "\u22F7",
      notinvc: "\u22F6",
      NotLeftTriangle: "\u22EA",
      NotLeftTriangleBar: "\u29CF\u0338",
      NotLeftTriangleEqual: "\u22EC",
      NotLess: "\u226E",
      NotLessEqual: "\u2270",
      NotLessGreater: "\u2278",
      NotLessLess: "\u226A\u0338",
      NotLessSlantEqual: "\u2A7D\u0338",
      NotLessTilde: "\u2274",
      NotNestedGreaterGreater: "\u2AA2\u0338",
      NotNestedLessLess: "\u2AA1\u0338",
      notni: "\u220C",
      notniva: "\u220C",
      notnivb: "\u22FE",
      notnivc: "\u22FD",
      NotPrecedes: "\u2280",
      NotPrecedesEqual: "\u2AAF\u0338",
      NotPrecedesSlantEqual: "\u22E0",
      NotReverseElement: "\u220C",
      NotRightTriangle: "\u22EB",
      NotRightTriangleBar: "\u29D0\u0338",
      NotRightTriangleEqual: "\u22ED",
      NotSquareSubset: "\u228F\u0338",
      NotSquareSubsetEqual: "\u22E2",
      NotSquareSuperset: "\u2290\u0338",
      NotSquareSupersetEqual: "\u22E3",
      NotSubset: "\u2282\u20D2",
      NotSubsetEqual: "\u2288",
      NotSucceeds: "\u2281",
      NotSucceedsEqual: "\u2AB0\u0338",
      NotSucceedsSlantEqual: "\u22E1",
      NotSucceedsTilde: "\u227F\u0338",
      NotSuperset: "\u2283\u20D2",
      NotSupersetEqual: "\u2289",
      NotTilde: "\u2241",
      NotTildeEqual: "\u2244",
      NotTildeFullEqual: "\u2247",
      NotTildeTilde: "\u2249",
      NotVerticalBar: "\u2224",
      npar: "\u2226",
      nparallel: "\u2226",
      nparsl: "\u2AFD\u20E5",
      npart: "\u2202\u0338",
      npolint: "\u2A14",
      npr: "\u2280",
      nprcue: "\u22E0",
      npre: "\u2AAF\u0338",
      nprec: "\u2280",
      npreceq: "\u2AAF\u0338",
      nrArr: "\u21CF",
      nrarr: "\u219B",
      nrarrc: "\u2933\u0338",
      nrarrw: "\u219D\u0338",
      nRightarrow: "\u21CF",
      nrightarrow: "\u219B",
      nrtri: "\u22EB",
      nrtrie: "\u22ED",
      nsc: "\u2281",
      nsccue: "\u22E1",
      nsce: "\u2AB0\u0338",
      Nscr: "\u{1D4A9}",
      nscr: "\u{1D4C3}",
      nshortmid: "\u2224",
      nshortparallel: "\u2226",
      nsim: "\u2241",
      nsime: "\u2244",
      nsimeq: "\u2244",
      nsmid: "\u2224",
      nspar: "\u2226",
      nsqsube: "\u22E2",
      nsqsupe: "\u22E3",
      nsub: "\u2284",
      nsubE: "\u2AC5\u0338",
      nsube: "\u2288",
      nsubset: "\u2282\u20D2",
      nsubseteq: "\u2288",
      nsubseteqq: "\u2AC5\u0338",
      nsucc: "\u2281",
      nsucceq: "\u2AB0\u0338",
      nsup: "\u2285",
      nsupE: "\u2AC6\u0338",
      nsupe: "\u2289",
      nsupset: "\u2283\u20D2",
      nsupseteq: "\u2289",
      nsupseteqq: "\u2AC6\u0338",
      ntgl: "\u2279",
      Ntilde: "\xD1",
      ntilde: "\xF1",
      ntlg: "\u2278",
      ntriangleleft: "\u22EA",
      ntrianglelefteq: "\u22EC",
      ntriangleright: "\u22EB",
      ntrianglerighteq: "\u22ED",
      Nu: "\u039D",
      nu: "\u03BD",
      num: "#",
      numero: "\u2116",
      numsp: "\u2007",
      nvap: "\u224D\u20D2",
      nVDash: "\u22AF",
      nVdash: "\u22AE",
      nvDash: "\u22AD",
      nvdash: "\u22AC",
      nvge: "\u2265\u20D2",
      nvgt: ">\u20D2",
      nvHarr: "\u2904",
      nvinfin: "\u29DE",
      nvlArr: "\u2902",
      nvle: "\u2264\u20D2",
      nvlt: "<\u20D2",
      nvltrie: "\u22B4\u20D2",
      nvrArr: "\u2903",
      nvrtrie: "\u22B5\u20D2",
      nvsim: "\u223C\u20D2",
      nwarhk: "\u2923",
      nwArr: "\u21D6",
      nwarr: "\u2196",
      nwarrow: "\u2196",
      nwnear: "\u2927",
      Oacute: "\xD3",
      oacute: "\xF3",
      oast: "\u229B",
      ocir: "\u229A",
      Ocirc: "\xD4",
      ocirc: "\xF4",
      Ocy: "\u041E",
      ocy: "\u043E",
      odash: "\u229D",
      Odblac: "\u0150",
      odblac: "\u0151",
      odiv: "\u2A38",
      odot: "\u2299",
      odsold: "\u29BC",
      OElig: "\u0152",
      oelig: "\u0153",
      ofcir: "\u29BF",
      Ofr: "\u{1D512}",
      ofr: "\u{1D52C}",
      ogon: "\u02DB",
      Ograve: "\xD2",
      ograve: "\xF2",
      ogt: "\u29C1",
      ohbar: "\u29B5",
      ohm: "\u03A9",
      oint: "\u222E",
      olarr: "\u21BA",
      olcir: "\u29BE",
      olcross: "\u29BB",
      oline: "\u203E",
      olt: "\u29C0",
      Omacr: "\u014C",
      omacr: "\u014D",
      Omega: "\u03A9",
      omega: "\u03C9",
      Omicron: "\u039F",
      omicron: "\u03BF",
      omid: "\u29B6",
      ominus: "\u2296",
      Oopf: "\u{1D546}",
      oopf: "\u{1D560}",
      opar: "\u29B7",
      OpenCurlyDoubleQuote: "\u201C",
      OpenCurlyQuote: "\u2018",
      operp: "\u29B9",
      oplus: "\u2295",
      Or: "\u2A54",
      or: "\u2228",
      orarr: "\u21BB",
      ord: "\u2A5D",
      order: "\u2134",
      orderof: "\u2134",
      ordf: "\xAA",
      ordm: "\xBA",
      origof: "\u22B6",
      oror: "\u2A56",
      orslope: "\u2A57",
      orv: "\u2A5B",
      oS: "\u24C8",
      Oscr: "\u{1D4AA}",
      oscr: "\u2134",
      Oslash: "\xD8",
      oslash: "\xF8",
      osol: "\u2298",
      Otilde: "\xD5",
      otilde: "\xF5",
      Otimes: "\u2A37",
      otimes: "\u2297",
      otimesas: "\u2A36",
      Ouml: "\xD6",
      ouml: "\xF6",
      ovbar: "\u233D",
      OverBar: "\u203E",
      OverBrace: "\u23DE",
      OverBracket: "\u23B4",
      OverParenthesis: "\u23DC",
      par: "\u2225",
      para: "\xB6",
      parallel: "\u2225",
      parsim: "\u2AF3",
      parsl: "\u2AFD",
      part: "\u2202",
      PartialD: "\u2202",
      Pcy: "\u041F",
      pcy: "\u043F",
      percnt: "%",
      period: ".",
      permil: "\u2030",
      perp: "\u22A5",
      pertenk: "\u2031",
      Pfr: "\u{1D513}",
      pfr: "\u{1D52D}",
      Phi: "\u03A6",
      phi: "\u03C6",
      phiv: "\u03D5",
      phmmat: "\u2133",
      phone: "\u260E",
      Pi: "\u03A0",
      pi: "\u03C0",
      pitchfork: "\u22D4",
      piv: "\u03D6",
      planck: "\u210F",
      planckh: "\u210E",
      plankv: "\u210F",
      plus: "+",
      plusacir: "\u2A23",
      plusb: "\u229E",
      pluscir: "\u2A22",
      plusdo: "\u2214",
      plusdu: "\u2A25",
      pluse: "\u2A72",
      PlusMinus: "\xB1",
      plusmn: "\xB1",
      plussim: "\u2A26",
      plustwo: "\u2A27",
      pm: "\xB1",
      Poincareplane: "\u210C",
      pointint: "\u2A15",
      Popf: "\u2119",
      popf: "\u{1D561}",
      pound: "\xA3",
      Pr: "\u2ABB",
      pr: "\u227A",
      prap: "\u2AB7",
      prcue: "\u227C",
      prE: "\u2AB3",
      pre: "\u2AAF",
      prec: "\u227A",
      precapprox: "\u2AB7",
      preccurlyeq: "\u227C",
      Precedes: "\u227A",
      PrecedesEqual: "\u2AAF",
      PrecedesSlantEqual: "\u227C",
      PrecedesTilde: "\u227E",
      preceq: "\u2AAF",
      precnapprox: "\u2AB9",
      precneqq: "\u2AB5",
      precnsim: "\u22E8",
      precsim: "\u227E",
      Prime: "\u2033",
      prime: "\u2032",
      primes: "\u2119",
      prnap: "\u2AB9",
      prnE: "\u2AB5",
      prnsim: "\u22E8",
      prod: "\u220F",
      Product: "\u220F",
      profalar: "\u232E",
      profline: "\u2312",
      profsurf: "\u2313",
      prop: "\u221D",
      Proportion: "\u2237",
      Proportional: "\u221D",
      propto: "\u221D",
      prsim: "\u227E",
      prurel: "\u22B0",
      Pscr: "\u{1D4AB}",
      pscr: "\u{1D4C5}",
      Psi: "\u03A8",
      psi: "\u03C8",
      puncsp: "\u2008",
      Qfr: "\u{1D514}",
      qfr: "\u{1D52E}",
      qint: "\u2A0C",
      Qopf: "\u211A",
      qopf: "\u{1D562}",
      qprime: "\u2057",
      Qscr: "\u{1D4AC}",
      qscr: "\u{1D4C6}",
      quaternions: "\u210D",
      quatint: "\u2A16",
      quest: "?",
      questeq: "\u225F",
      QUOT: '"',
      quot: '"',
      rAarr: "\u21DB",
      race: "\u223D\u0331",
      Racute: "\u0154",
      racute: "\u0155",
      radic: "\u221A",
      raemptyv: "\u29B3",
      Rang: "\u27EB",
      rang: "\u27E9",
      rangd: "\u2992",
      range: "\u29A5",
      rangle: "\u27E9",
      raquo: "\xBB",
      Rarr: "\u21A0",
      rArr: "\u21D2",
      rarr: "\u2192",
      rarrap: "\u2975",
      rarrb: "\u21E5",
      rarrbfs: "\u2920",
      rarrc: "\u2933",
      rarrfs: "\u291E",
      rarrhk: "\u21AA",
      rarrlp: "\u21AC",
      rarrpl: "\u2945",
      rarrsim: "\u2974",
      Rarrtl: "\u2916",
      rarrtl: "\u21A3",
      rarrw: "\u219D",
      rAtail: "\u291C",
      ratail: "\u291A",
      ratio: "\u2236",
      rationals: "\u211A",
      RBarr: "\u2910",
      rBarr: "\u290F",
      rbarr: "\u290D",
      rbbrk: "\u2773",
      rbrace: "}",
      rbrack: "]",
      rbrke: "\u298C",
      rbrksld: "\u298E",
      rbrkslu: "\u2990",
      Rcaron: "\u0158",
      rcaron: "\u0159",
      Rcedil: "\u0156",
      rcedil: "\u0157",
      rceil: "\u2309",
      rcub: "}",
      Rcy: "\u0420",
      rcy: "\u0440",
      rdca: "\u2937",
      rdldhar: "\u2969",
      rdquo: "\u201D",
      rdquor: "\u201D",
      rdsh: "\u21B3",
      Re: "\u211C",
      real: "\u211C",
      realine: "\u211B",
      realpart: "\u211C",
      reals: "\u211D",
      rect: "\u25AD",
      REG: "\xAE",
      reg: "\xAE",
      ReverseElement: "\u220B",
      ReverseEquilibrium: "\u21CB",
      ReverseUpEquilibrium: "\u296F",
      rfisht: "\u297D",
      rfloor: "\u230B",
      Rfr: "\u211C",
      rfr: "\u{1D52F}",
      rHar: "\u2964",
      rhard: "\u21C1",
      rharu: "\u21C0",
      rharul: "\u296C",
      Rho: "\u03A1",
      rho: "\u03C1",
      rhov: "\u03F1",
      RightAngleBracket: "\u27E9",
      RightArrow: "\u2192",
      Rightarrow: "\u21D2",
      rightarrow: "\u2192",
      RightArrowBar: "\u21E5",
      RightArrowLeftArrow: "\u21C4",
      rightarrowtail: "\u21A3",
      RightCeiling: "\u2309",
      RightDoubleBracket: "\u27E7",
      RightDownTeeVector: "\u295D",
      RightDownVector: "\u21C2",
      RightDownVectorBar: "\u2955",
      RightFloor: "\u230B",
      rightharpoondown: "\u21C1",
      rightharpoonup: "\u21C0",
      rightleftarrows: "\u21C4",
      rightleftharpoons: "\u21CC",
      rightrightarrows: "\u21C9",
      rightsquigarrow: "\u219D",
      RightTee: "\u22A2",
      RightTeeArrow: "\u21A6",
      RightTeeVector: "\u295B",
      rightthreetimes: "\u22CC",
      RightTriangle: "\u22B3",
      RightTriangleBar: "\u29D0",
      RightTriangleEqual: "\u22B5",
      RightUpDownVector: "\u294F",
      RightUpTeeVector: "\u295C",
      RightUpVector: "\u21BE",
      RightUpVectorBar: "\u2954",
      RightVector: "\u21C0",
      RightVectorBar: "\u2953",
      ring: "\u02DA",
      risingdotseq: "\u2253",
      rlarr: "\u21C4",
      rlhar: "\u21CC",
      rlm: "\u200F",
      rmoust: "\u23B1",
      rmoustache: "\u23B1",
      rnmid: "\u2AEE",
      roang: "\u27ED",
      roarr: "\u21FE",
      robrk: "\u27E7",
      ropar: "\u2986",
      Ropf: "\u211D",
      ropf: "\u{1D563}",
      roplus: "\u2A2E",
      rotimes: "\u2A35",
      RoundImplies: "\u2970",
      rpar: ")",
      rpargt: "\u2994",
      rppolint: "\u2A12",
      rrarr: "\u21C9",
      Rrightarrow: "\u21DB",
      rsaquo: "\u203A",
      Rscr: "\u211B",
      rscr: "\u{1D4C7}",
      Rsh: "\u21B1",
      rsh: "\u21B1",
      rsqb: "]",
      rsquo: "\u2019",
      rsquor: "\u2019",
      rthree: "\u22CC",
      rtimes: "\u22CA",
      rtri: "\u25B9",
      rtrie: "\u22B5",
      rtrif: "\u25B8",
      rtriltri: "\u29CE",
      RuleDelayed: "\u29F4",
      ruluhar: "\u2968",
      rx: "\u211E",
      Sacute: "\u015A",
      sacute: "\u015B",
      sbquo: "\u201A",
      Sc: "\u2ABC",
      sc: "\u227B",
      scap: "\u2AB8",
      Scaron: "\u0160",
      scaron: "\u0161",
      sccue: "\u227D",
      scE: "\u2AB4",
      sce: "\u2AB0",
      Scedil: "\u015E",
      scedil: "\u015F",
      Scirc: "\u015C",
      scirc: "\u015D",
      scnap: "\u2ABA",
      scnE: "\u2AB6",
      scnsim: "\u22E9",
      scpolint: "\u2A13",
      scsim: "\u227F",
      Scy: "\u0421",
      scy: "\u0441",
      sdot: "\u22C5",
      sdotb: "\u22A1",
      sdote: "\u2A66",
      searhk: "\u2925",
      seArr: "\u21D8",
      searr: "\u2198",
      searrow: "\u2198",
      sect: "\xA7",
      semi: ";",
      seswar: "\u2929",
      setminus: "\u2216",
      setmn: "\u2216",
      sext: "\u2736",
      Sfr: "\u{1D516}",
      sfr: "\u{1D530}",
      sfrown: "\u2322",
      sharp: "\u266F",
      SHCHcy: "\u0429",
      shchcy: "\u0449",
      SHcy: "\u0428",
      shcy: "\u0448",
      ShortDownArrow: "\u2193",
      ShortLeftArrow: "\u2190",
      shortmid: "\u2223",
      shortparallel: "\u2225",
      ShortRightArrow: "\u2192",
      ShortUpArrow: "\u2191",
      shy: "\xAD",
      Sigma: "\u03A3",
      sigma: "\u03C3",
      sigmaf: "\u03C2",
      sigmav: "\u03C2",
      sim: "\u223C",
      simdot: "\u2A6A",
      sime: "\u2243",
      simeq: "\u2243",
      simg: "\u2A9E",
      simgE: "\u2AA0",
      siml: "\u2A9D",
      simlE: "\u2A9F",
      simne: "\u2246",
      simplus: "\u2A24",
      simrarr: "\u2972",
      slarr: "\u2190",
      SmallCircle: "\u2218",
      smallsetminus: "\u2216",
      smashp: "\u2A33",
      smeparsl: "\u29E4",
      smid: "\u2223",
      smile: "\u2323",
      smt: "\u2AAA",
      smte: "\u2AAC",
      smtes: "\u2AAC\uFE00",
      SOFTcy: "\u042C",
      softcy: "\u044C",
      sol: "/",
      solb: "\u29C4",
      solbar: "\u233F",
      Sopf: "\u{1D54A}",
      sopf: "\u{1D564}",
      spades: "\u2660",
      spadesuit: "\u2660",
      spar: "\u2225",
      sqcap: "\u2293",
      sqcaps: "\u2293\uFE00",
      sqcup: "\u2294",
      sqcups: "\u2294\uFE00",
      Sqrt: "\u221A",
      sqsub: "\u228F",
      sqsube: "\u2291",
      sqsubset: "\u228F",
      sqsubseteq: "\u2291",
      sqsup: "\u2290",
      sqsupe: "\u2292",
      sqsupset: "\u2290",
      sqsupseteq: "\u2292",
      squ: "\u25A1",
      Square: "\u25A1",
      square: "\u25A1",
      SquareIntersection: "\u2293",
      SquareSubset: "\u228F",
      SquareSubsetEqual: "\u2291",
      SquareSuperset: "\u2290",
      SquareSupersetEqual: "\u2292",
      SquareUnion: "\u2294",
      squarf: "\u25AA",
      squf: "\u25AA",
      srarr: "\u2192",
      Sscr: "\u{1D4AE}",
      sscr: "\u{1D4C8}",
      ssetmn: "\u2216",
      ssmile: "\u2323",
      sstarf: "\u22C6",
      Star: "\u22C6",
      star: "\u2606",
      starf: "\u2605",
      straightepsilon: "\u03F5",
      straightphi: "\u03D5",
      strns: "\xAF",
      Sub: "\u22D0",
      sub: "\u2282",
      subdot: "\u2ABD",
      subE: "\u2AC5",
      sube: "\u2286",
      subedot: "\u2AC3",
      submult: "\u2AC1",
      subnE: "\u2ACB",
      subne: "\u228A",
      subplus: "\u2ABF",
      subrarr: "\u2979",
      Subset: "\u22D0",
      subset: "\u2282",
      subseteq: "\u2286",
      subseteqq: "\u2AC5",
      SubsetEqual: "\u2286",
      subsetneq: "\u228A",
      subsetneqq: "\u2ACB",
      subsim: "\u2AC7",
      subsub: "\u2AD5",
      subsup: "\u2AD3",
      succ: "\u227B",
      succapprox: "\u2AB8",
      succcurlyeq: "\u227D",
      Succeeds: "\u227B",
      SucceedsEqual: "\u2AB0",
      SucceedsSlantEqual: "\u227D",
      SucceedsTilde: "\u227F",
      succeq: "\u2AB0",
      succnapprox: "\u2ABA",
      succneqq: "\u2AB6",
      succnsim: "\u22E9",
      succsim: "\u227F",
      SuchThat: "\u220B",
      Sum: "\u2211",
      sum: "\u2211",
      sung: "\u266A",
      Sup: "\u22D1",
      sup: "\u2283",
      sup1: "\xB9",
      sup2: "\xB2",
      sup3: "\xB3",
      supdot: "\u2ABE",
      supdsub: "\u2AD8",
      supE: "\u2AC6",
      supe: "\u2287",
      supedot: "\u2AC4",
      Superset: "\u2283",
      SupersetEqual: "\u2287",
      suphsol: "\u27C9",
      suphsub: "\u2AD7",
      suplarr: "\u297B",
      supmult: "\u2AC2",
      supnE: "\u2ACC",
      supne: "\u228B",
      supplus: "\u2AC0",
      Supset: "\u22D1",
      supset: "\u2283",
      supseteq: "\u2287",
      supseteqq: "\u2AC6",
      supsetneq: "\u228B",
      supsetneqq: "\u2ACC",
      supsim: "\u2AC8",
      supsub: "\u2AD4",
      supsup: "\u2AD6",
      swarhk: "\u2926",
      swArr: "\u21D9",
      swarr: "\u2199",
      swarrow: "\u2199",
      swnwar: "\u292A",
      szlig: "\xDF",
      Tab: "	",
      target: "\u2316",
      Tau: "\u03A4",
      tau: "\u03C4",
      tbrk: "\u23B4",
      Tcaron: "\u0164",
      tcaron: "\u0165",
      Tcedil: "\u0162",
      tcedil: "\u0163",
      Tcy: "\u0422",
      tcy: "\u0442",
      tdot: "\u20DB",
      telrec: "\u2315",
      Tfr: "\u{1D517}",
      tfr: "\u{1D531}",
      there4: "\u2234",
      Therefore: "\u2234",
      therefore: "\u2234",
      Theta: "\u0398",
      theta: "\u03B8",
      thetasym: "\u03D1",
      thetav: "\u03D1",
      thickapprox: "\u2248",
      thicksim: "\u223C",
      ThickSpace: "\u205F\u200A",
      thinsp: "\u2009",
      ThinSpace: "\u2009",
      thkap: "\u2248",
      thksim: "\u223C",
      THORN: "\xDE",
      thorn: "\xFE",
      Tilde: "\u223C",
      tilde: "\u02DC",
      TildeEqual: "\u2243",
      TildeFullEqual: "\u2245",
      TildeTilde: "\u2248",
      times: "\xD7",
      timesb: "\u22A0",
      timesbar: "\u2A31",
      timesd: "\u2A30",
      tint: "\u222D",
      toea: "\u2928",
      top: "\u22A4",
      topbot: "\u2336",
      topcir: "\u2AF1",
      Topf: "\u{1D54B}",
      topf: "\u{1D565}",
      topfork: "\u2ADA",
      tosa: "\u2929",
      tprime: "\u2034",
      TRADE: "\u2122",
      trade: "\u2122",
      triangle: "\u25B5",
      triangledown: "\u25BF",
      triangleleft: "\u25C3",
      trianglelefteq: "\u22B4",
      triangleq: "\u225C",
      triangleright: "\u25B9",
      trianglerighteq: "\u22B5",
      tridot: "\u25EC",
      trie: "\u225C",
      triminus: "\u2A3A",
      TripleDot: "\u20DB",
      triplus: "\u2A39",
      trisb: "\u29CD",
      tritime: "\u2A3B",
      trpezium: "\u23E2",
      Tscr: "\u{1D4AF}",
      tscr: "\u{1D4C9}",
      TScy: "\u0426",
      tscy: "\u0446",
      TSHcy: "\u040B",
      tshcy: "\u045B",
      Tstrok: "\u0166",
      tstrok: "\u0167",
      twixt: "\u226C",
      twoheadleftarrow: "\u219E",
      twoheadrightarrow: "\u21A0",
      Uacute: "\xDA",
      uacute: "\xFA",
      Uarr: "\u219F",
      uArr: "\u21D1",
      uarr: "\u2191",
      Uarrocir: "\u2949",
      Ubrcy: "\u040E",
      ubrcy: "\u045E",
      Ubreve: "\u016C",
      ubreve: "\u016D",
      Ucirc: "\xDB",
      ucirc: "\xFB",
      Ucy: "\u0423",
      ucy: "\u0443",
      udarr: "\u21C5",
      Udblac: "\u0170",
      udblac: "\u0171",
      udhar: "\u296E",
      ufisht: "\u297E",
      Ufr: "\u{1D518}",
      ufr: "\u{1D532}",
      Ugrave: "\xD9",
      ugrave: "\xF9",
      uHar: "\u2963",
      uharl: "\u21BF",
      uharr: "\u21BE",
      uhblk: "\u2580",
      ulcorn: "\u231C",
      ulcorner: "\u231C",
      ulcrop: "\u230F",
      ultri: "\u25F8",
      Umacr: "\u016A",
      umacr: "\u016B",
      uml: "\xA8",
      UnderBar: "_",
      UnderBrace: "\u23DF",
      UnderBracket: "\u23B5",
      UnderParenthesis: "\u23DD",
      Union: "\u22C3",
      UnionPlus: "\u228E",
      Uogon: "\u0172",
      uogon: "\u0173",
      Uopf: "\u{1D54C}",
      uopf: "\u{1D566}",
      UpArrow: "\u2191",
      Uparrow: "\u21D1",
      uparrow: "\u2191",
      UpArrowBar: "\u2912",
      UpArrowDownArrow: "\u21C5",
      UpDownArrow: "\u2195",
      Updownarrow: "\u21D5",
      updownarrow: "\u2195",
      UpEquilibrium: "\u296E",
      upharpoonleft: "\u21BF",
      upharpoonright: "\u21BE",
      uplus: "\u228E",
      UpperLeftArrow: "\u2196",
      UpperRightArrow: "\u2197",
      Upsi: "\u03D2",
      upsi: "\u03C5",
      upsih: "\u03D2",
      Upsilon: "\u03A5",
      upsilon: "\u03C5",
      UpTee: "\u22A5",
      UpTeeArrow: "\u21A5",
      upuparrows: "\u21C8",
      urcorn: "\u231D",
      urcorner: "\u231D",
      urcrop: "\u230E",
      Uring: "\u016E",
      uring: "\u016F",
      urtri: "\u25F9",
      Uscr: "\u{1D4B0}",
      uscr: "\u{1D4CA}",
      utdot: "\u22F0",
      Utilde: "\u0168",
      utilde: "\u0169",
      utri: "\u25B5",
      utrif: "\u25B4",
      uuarr: "\u21C8",
      Uuml: "\xDC",
      uuml: "\xFC",
      uwangle: "\u29A7",
      vangrt: "\u299C",
      varepsilon: "\u03F5",
      varkappa: "\u03F0",
      varnothing: "\u2205",
      varphi: "\u03D5",
      varpi: "\u03D6",
      varpropto: "\u221D",
      vArr: "\u21D5",
      varr: "\u2195",
      varrho: "\u03F1",
      varsigma: "\u03C2",
      varsubsetneq: "\u228A\uFE00",
      varsubsetneqq: "\u2ACB\uFE00",
      varsupsetneq: "\u228B\uFE00",
      varsupsetneqq: "\u2ACC\uFE00",
      vartheta: "\u03D1",
      vartriangleleft: "\u22B2",
      vartriangleright: "\u22B3",
      Vbar: "\u2AEB",
      vBar: "\u2AE8",
      vBarv: "\u2AE9",
      Vcy: "\u0412",
      vcy: "\u0432",
      VDash: "\u22AB",
      Vdash: "\u22A9",
      vDash: "\u22A8",
      vdash: "\u22A2",
      Vdashl: "\u2AE6",
      Vee: "\u22C1",
      vee: "\u2228",
      veebar: "\u22BB",
      veeeq: "\u225A",
      vellip: "\u22EE",
      Verbar: "\u2016",
      verbar: "|",
      Vert: "\u2016",
      vert: "|",
      VerticalBar: "\u2223",
      VerticalLine: "|",
      VerticalSeparator: "\u2758",
      VerticalTilde: "\u2240",
      VeryThinSpace: "\u200A",
      Vfr: "\u{1D519}",
      vfr: "\u{1D533}",
      vltri: "\u22B2",
      vnsub: "\u2282\u20D2",
      vnsup: "\u2283\u20D2",
      Vopf: "\u{1D54D}",
      vopf: "\u{1D567}",
      vprop: "\u221D",
      vrtri: "\u22B3",
      Vscr: "\u{1D4B1}",
      vscr: "\u{1D4CB}",
      vsubnE: "\u2ACB\uFE00",
      vsubne: "\u228A\uFE00",
      vsupnE: "\u2ACC\uFE00",
      vsupne: "\u228B\uFE00",
      Vvdash: "\u22AA",
      vzigzag: "\u299A",
      Wcirc: "\u0174",
      wcirc: "\u0175",
      wedbar: "\u2A5F",
      Wedge: "\u22C0",
      wedge: "\u2227",
      wedgeq: "\u2259",
      weierp: "\u2118",
      Wfr: "\u{1D51A}",
      wfr: "\u{1D534}",
      Wopf: "\u{1D54E}",
      wopf: "\u{1D568}",
      wp: "\u2118",
      wr: "\u2240",
      wreath: "\u2240",
      Wscr: "\u{1D4B2}",
      wscr: "\u{1D4CC}",
      xcap: "\u22C2",
      xcirc: "\u25EF",
      xcup: "\u22C3",
      xdtri: "\u25BD",
      Xfr: "\u{1D51B}",
      xfr: "\u{1D535}",
      xhArr: "\u27FA",
      xharr: "\u27F7",
      Xi: "\u039E",
      xi: "\u03BE",
      xlArr: "\u27F8",
      xlarr: "\u27F5",
      xmap: "\u27FC",
      xnis: "\u22FB",
      xodot: "\u2A00",
      Xopf: "\u{1D54F}",
      xopf: "\u{1D569}",
      xoplus: "\u2A01",
      xotime: "\u2A02",
      xrArr: "\u27F9",
      xrarr: "\u27F6",
      Xscr: "\u{1D4B3}",
      xscr: "\u{1D4CD}",
      xsqcup: "\u2A06",
      xuplus: "\u2A04",
      xutri: "\u25B3",
      xvee: "\u22C1",
      xwedge: "\u22C0",
      Yacute: "\xDD",
      yacute: "\xFD",
      YAcy: "\u042F",
      yacy: "\u044F",
      Ycirc: "\u0176",
      ycirc: "\u0177",
      Ycy: "\u042B",
      ycy: "\u044B",
      yen: "\xA5",
      Yfr: "\u{1D51C}",
      yfr: "\u{1D536}",
      YIcy: "\u0407",
      yicy: "\u0457",
      Yopf: "\u{1D550}",
      yopf: "\u{1D56A}",
      Yscr: "\u{1D4B4}",
      yscr: "\u{1D4CE}",
      YUcy: "\u042E",
      yucy: "\u044E",
      Yuml: "\u0178",
      yuml: "\xFF",
      Zacute: "\u0179",
      zacute: "\u017A",
      Zcaron: "\u017D",
      zcaron: "\u017E",
      Zcy: "\u0417",
      zcy: "\u0437",
      Zdot: "\u017B",
      zdot: "\u017C",
      zeetrf: "\u2128",
      ZeroWidthSpace: "\u200B",
      Zeta: "\u0396",
      zeta: "\u03B6",
      Zfr: "\u2128",
      zfr: "\u{1D537}",
      ZHcy: "\u0416",
      zhcy: "\u0436",
      zigrarr: "\u21DD",
      Zopf: "\u2124",
      zopf: "\u{1D56B}",
      Zscr: "\u{1D4B5}",
      zscr: "\u{1D4CF}",
      zwj: "\u200D",
      zwnj: "\u200C"
    });
    exports2.entityMap = exports2.HTML_ENTITIES;
  }
});

// node_modules/@xmldom/xmldom/lib/sax.js
var require_sax = __commonJS({
  "node_modules/@xmldom/xmldom/lib/sax.js"(exports2) {
    "use strict";
    var conventions = require_conventions();
    var g = require_grammar();
    var errors = require_errors();
    var isHTMLEscapableRawTextElement = conventions.isHTMLEscapableRawTextElement;
    var isHTMLMimeType = conventions.isHTMLMimeType;
    var isHTMLRawTextElement = conventions.isHTMLRawTextElement;
    var hasOwn = conventions.hasOwn;
    var NAMESPACE = conventions.NAMESPACE;
    var ParseError = errors.ParseError;
    var DOMException = errors.DOMException;
    var S_TAG = 0;
    var S_ATTR = 1;
    var S_ATTR_SPACE = 2;
    var S_EQ = 3;
    var S_ATTR_NOQUOT_VALUE = 4;
    var S_ATTR_END = 5;
    var S_TAG_SPACE = 6;
    var S_TAG_CLOSE = 7;
    function XMLReader() {
    }
    XMLReader.prototype = {
      parse: function(source, defaultNSMap, entityMap) {
        var domBuilder = this.domBuilder;
        domBuilder.startDocument();
        _copy(defaultNSMap, defaultNSMap = /* @__PURE__ */ Object.create(null));
        parse(source, defaultNSMap, entityMap, domBuilder, this.errorHandler);
        domBuilder.endDocument();
      }
    };
    var ENTITY_REG = /&#?\w+;?/g;
    function parse(source, defaultNSMapCopy, entityMap, domBuilder, errorHandler) {
      var isHTML = isHTMLMimeType(domBuilder.mimeType);
      if (source.indexOf(g.UNICODE_REPLACEMENT_CHARACTER) >= 0) {
        errorHandler.warning("Unicode replacement character detected, source encoding issues?");
      }
      function fixedFromCharCode(code) {
        if (code > 65535) {
          code -= 65536;
          var surrogate1 = 55296 + (code >> 10), surrogate2 = 56320 + (code & 1023);
          return String.fromCharCode(surrogate1, surrogate2);
        } else {
          return String.fromCharCode(code);
        }
      }
      function entityReplacer(a2) {
        var complete = a2[a2.length - 1] === ";" ? a2 : a2 + ";";
        if (!isHTML && complete !== a2) {
          errorHandler.error("EntityRef: expecting ;");
          return a2;
        }
        var match = g.Reference.exec(complete);
        if (!match || match[0].length !== complete.length) {
          errorHandler.error("entity not matching Reference production: " + a2);
          return a2;
        }
        var k = complete.slice(1, -1);
        if (hasOwn(entityMap, k)) {
          return entityMap[k];
        } else if (k.charAt(0) === "#") {
          return fixedFromCharCode(parseInt(k.substring(1).replace("x", "0x")));
        } else {
          errorHandler.error("entity not found:" + a2);
          return a2;
        }
      }
      function appendText(end2) {
        if (end2 > start) {
          var xt = source.substring(start, end2).replace(ENTITY_REG, entityReplacer);
          locator && position(start);
          domBuilder.characters(xt, 0, end2 - start);
          start = end2;
        }
      }
      var lineStart = 0;
      var lineEnd = 0;
      var linePattern = /\r\n?|\n|$/g;
      var locator = domBuilder.locator;
      function position(p, m) {
        while (p >= lineEnd && (m = linePattern.exec(source))) {
          lineStart = lineEnd;
          lineEnd = m.index + m[0].length;
          locator.lineNumber++;
        }
        locator.columnNumber = p - lineStart + 1;
      }
      var parseStack = [{ currentNSMap: defaultNSMapCopy }];
      var unclosedTags = [];
      var start = 0;
      while (true) {
        try {
          var tagStart = source.indexOf("<", start);
          if (tagStart < 0) {
            if (!isHTML && unclosedTags.length > 0) {
              return errorHandler.fatalError("unclosed xml tag(s): " + unclosedTags.join(", "));
            }
            if (!source.substring(start).match(/^\s*$/)) {
              var doc = domBuilder.doc;
              var text = doc.createTextNode(source.substring(start));
              if (doc.documentElement) {
                return errorHandler.error("Extra content at the end of the document");
              }
              doc.appendChild(text);
              domBuilder.currentElement = text;
            }
            return;
          }
          if (tagStart > start) {
            var fromSource = source.substring(start, tagStart);
            if (!isHTML && unclosedTags.length === 0) {
              fromSource = fromSource.replace(new RegExp(g.S_OPT.source, "g"), "");
              fromSource && errorHandler.error("Unexpected content outside root element: '" + fromSource + "'");
            }
            appendText(tagStart);
          }
          switch (source.charAt(tagStart + 1)) {
            case "/":
              var end = source.indexOf(">", tagStart + 2);
              var tagNameRaw = source.substring(tagStart + 2, end > 0 ? end : void 0);
              if (!tagNameRaw) {
                return errorHandler.fatalError("end tag name missing");
              }
              var endTagNameStrict = g.reg("^", g.QName_group, g.S_OPT, "$");
              var tagNameMatch = end > 0 && endTagNameStrict.exec(tagNameRaw);
              if (!tagNameMatch) {
                var leadingTagNameMatch = end > 0 && g.reg("^", g.QName_group).exec(tagNameRaw);
                if (isHTML && leadingTagNameMatch) {
                  errorHandler.warning('end tag name contains invalid trailing characters: "' + tagNameRaw + '"');
                  tagNameMatch = leadingTagNameMatch;
                } else if (
                  // Backward compatibility, remove this whole `else if` arm in the next breaking release
                  // (XML then falls through to the `fatalError` below, for a clean mode split: XML fatal,
                  // HTML warning). A valid end-tag name followed by a line break and trailing content was
                  // silently accepted while `reg` still used the `m` flag; re-adding `m` here matches exactly
                  // those inputs, kept recoverable and reported.
                  leadingTagNameMatch && new RegExp(endTagNameStrict.source, endTagNameStrict.flags + "m").test(tagNameRaw)
                ) {
                  errorHandler.error('end tag name is followed by a line break and trailing content: "' + tagNameRaw + '"');
                  tagNameMatch = leadingTagNameMatch;
                } else {
                  return errorHandler.fatalError('end tag name contains invalid characters: "' + tagNameRaw + '"');
                }
              }
              if (!domBuilder.currentElement && !domBuilder.doc.documentElement) {
                return;
              }
              var currentTagName = unclosedTags[unclosedTags.length - 1] || domBuilder.currentElement.tagName || domBuilder.doc.documentElement.tagName || "";
              if (currentTagName !== tagNameMatch[1]) {
                var tagNameLower = tagNameMatch[1].toLowerCase();
                if (!isHTML || currentTagName.toLowerCase() !== tagNameLower) {
                  return errorHandler.fatalError('Opening and ending tag mismatch: "' + currentTagName + '" != "' + tagNameRaw + '"');
                }
              }
              var config = parseStack.pop();
              unclosedTags.pop();
              var localNSMap = config.localNSMap;
              domBuilder.endElement(config.uri, config.localName, currentTagName);
              if (localNSMap) {
                for (var prefix in localNSMap) {
                  if (hasOwn(localNSMap, prefix)) {
                    domBuilder.endPrefixMapping(prefix);
                  }
                }
              }
              end++;
              break;
            // end element
            case "?":
              locator && position(tagStart);
              end = parseProcessingInstruction(source, tagStart, domBuilder, errorHandler);
              break;
            case "!":
              locator && position(tagStart);
              end = parseDoctypeCommentOrCData(source, tagStart, domBuilder, errorHandler, isHTML);
              break;
            default:
              locator && position(tagStart);
              var el = new ElementAttributes();
              var currentNSMap = parseStack[parseStack.length - 1].currentNSMap;
              var end = parseElementStartPart(source, tagStart, el, currentNSMap, entityReplacer, errorHandler, isHTML);
              var len = el.length;
              if (!el.closed) {
                if (isHTML && conventions.isHTMLVoidElement(el.tagName)) {
                  el.closed = true;
                } else {
                  unclosedTags.push(el.tagName);
                }
              }
              if (locator && len) {
                var locator2 = copyLocator(locator, {});
                for (var i2 = 0; i2 < len; i2++) {
                  var a = el[i2];
                  position(a.offset);
                  a.locator = copyLocator(locator, {});
                }
                domBuilder.locator = locator2;
                if (appendElement(el, domBuilder, currentNSMap)) {
                  parseStack.push(el);
                }
                domBuilder.locator = locator;
              } else {
                if (appendElement(el, domBuilder, currentNSMap)) {
                  parseStack.push(el);
                }
              }
              if (isHTML && !el.closed) {
                end = parseHtmlSpecialContent(source, end, el.tagName, entityReplacer, domBuilder);
              } else {
                end++;
              }
          }
        } catch (e) {
          if (e instanceof ParseError) {
            throw e;
          } else if (e instanceof DOMException) {
            return errorHandler.fatalError("Error constructing the DOM: " + e.name + ": " + e.message, e);
          }
          errorHandler.error("element parse error: " + e);
          end = -1;
        }
        if (end > start) {
          start = end;
        } else {
          appendText(Math.max(tagStart, start) + 1);
        }
      }
    }
    function copyLocator(f, t) {
      t.lineNumber = f.lineNumber;
      t.columnNumber = f.columnNumber;
      return t;
    }
    function parseElementStartPart(source, start, el, currentNSMap, entityReplacer, errorHandler, isHTML) {
      function addAttribute(qname, value2, startIndex) {
        if (hasOwn(el.attributeNames, qname)) {
          return errorHandler.fatalError("Attribute " + qname + " redefined");
        }
        if (!isHTML && value2.indexOf("<") >= 0) {
          return errorHandler.fatalError("Unescaped '<' not allowed in attributes values");
        }
        el.addValue(
          qname,
          // @see https://www.w3.org/TR/xml/#AVNormalize
          // since the xmldom sax parser does not "interpret" DTD the following is not implemented:
          // - recursive replacement of (DTD) entity references
          // - trimming and collapsing multiple spaces into a single one for attributes that are not of type CDATA
          value2.replace(/[\t\n\r]/g, " ").replace(ENTITY_REG, entityReplacer),
          startIndex
        );
      }
      var attrName;
      var value;
      var p = ++start;
      var s = S_TAG;
      while (true) {
        var c = source.charAt(p);
        if (s === S_TAG && c === "<") {
          throw new Error("unexpected < in tag name: " + source.slice(start, p));
        }
        switch (c) {
          case "=":
            if (s === S_ATTR) {
              attrName = source.slice(start, p);
              s = S_EQ;
            } else if (s === S_ATTR_SPACE) {
              s = S_EQ;
            } else {
              throw new Error("attribute equal must after attrName");
            }
            break;
          case "'":
          case '"':
            if (s === S_EQ || s === S_ATTR) {
              if (s === S_ATTR) {
                errorHandler.warning('attribute value must after "="');
                attrName = source.slice(start, p);
              }
              start = p + 1;
              p = source.indexOf(c, start);
              if (p > 0) {
                value = source.slice(start, p);
                addAttribute(attrName, value, start - 1);
                s = S_ATTR_END;
              } else {
                throw new Error("attribute value no end '" + c + "' match");
              }
            } else if (s == S_ATTR_NOQUOT_VALUE) {
              value = source.slice(start, p);
              addAttribute(attrName, value, start);
              errorHandler.warning('attribute "' + attrName + '" missed start quot(' + c + ")!!");
              start = p + 1;
              s = S_ATTR_END;
            } else {
              throw new Error('attribute value must after "="');
            }
            break;
          case "/":
            switch (s) {
              case S_TAG:
                el.setTagName(source.slice(start, p));
              case S_ATTR_END:
              case S_TAG_SPACE:
              case S_TAG_CLOSE:
                s = S_TAG_CLOSE;
                el.closed = true;
              case S_ATTR_NOQUOT_VALUE:
              case S_ATTR:
                break;
              case S_ATTR_SPACE:
                el.closed = true;
                break;
              //case S_EQ:
              default:
                throw new Error("attribute invalid close char('/')");
            }
            break;
          case "":
            errorHandler.error("unexpected end of input");
            if (s == S_TAG) {
              el.setTagName(source.slice(start, p));
            }
            return p;
          case ">":
            switch (s) {
              case S_TAG:
                el.setTagName(source.slice(start, p));
              case S_ATTR_END:
              case S_TAG_SPACE:
              case S_TAG_CLOSE:
                break;
              //normal
              case S_ATTR_NOQUOT_VALUE:
              //Compatible state
              case S_ATTR:
                value = source.slice(start, p);
                if (value.slice(-1) === "/") {
                  el.closed = true;
                  value = value.slice(0, -1);
                }
              case S_ATTR_SPACE:
                if (s === S_ATTR_SPACE) {
                  value = attrName;
                }
                if (s == S_ATTR_NOQUOT_VALUE) {
                  errorHandler.warning('attribute "' + value + '" missed quot(")!');
                  addAttribute(attrName, value, start);
                } else {
                  if (!isHTML) {
                    errorHandler.warning('attribute "' + value + '" missed value!! "' + value + '" instead!!');
                  }
                  addAttribute(value, value, start);
                }
                break;
              case S_EQ:
                if (!isHTML) {
                  return errorHandler.fatalError(`AttValue: ' or " expected`);
                }
            }
            return p;
          /*xml space '\x20' | #x9 | #xD | #xA; */
          case "\x80":
            c = " ";
          default:
            if (c <= " ") {
              switch (s) {
                case S_TAG:
                  el.setTagName(source.slice(start, p));
                  s = S_TAG_SPACE;
                  break;
                case S_ATTR:
                  attrName = source.slice(start, p);
                  s = S_ATTR_SPACE;
                  break;
                case S_ATTR_NOQUOT_VALUE:
                  var value = source.slice(start, p);
                  errorHandler.warning('attribute "' + value + '" missed quot(")!!');
                  addAttribute(attrName, value, start);
                case S_ATTR_END:
                  s = S_TAG_SPACE;
                  break;
              }
            } else {
              switch (s) {
                //case S_TAG:void();break;
                //case S_ATTR:void();break;
                //case S_ATTR_NOQUOT_VALUE:void();break;
                case S_ATTR_SPACE:
                  if (!isHTML) {
                    errorHandler.warning('attribute "' + attrName + '" missed value!! "' + attrName + '" instead2!!');
                  }
                  addAttribute(attrName, attrName, start);
                  start = p;
                  s = S_ATTR;
                  break;
                case S_ATTR_END:
                  errorHandler.warning('attribute space is required"' + attrName + '"!!');
                case S_TAG_SPACE:
                  s = S_ATTR;
                  start = p;
                  break;
                case S_EQ:
                  s = S_ATTR_NOQUOT_VALUE;
                  start = p;
                  break;
                case S_TAG_CLOSE:
                  throw new Error("elements closed character '/' and '>' must be connected to");
              }
            }
        }
        p++;
      }
    }
    function appendElement(el, domBuilder, currentNSMap) {
      var tagName = el.tagName;
      var localNSMap = null;
      var i2 = el.length;
      while (i2--) {
        var a = el[i2];
        var qName = a.qName;
        var value = a.value;
        var nsp = qName.indexOf(":");
        if (nsp > 0) {
          var prefix = a.prefix = qName.slice(0, nsp);
          var localName = qName.slice(nsp + 1);
          var nsPrefix = prefix === "xmlns" && localName;
        } else {
          localName = qName;
          prefix = null;
          nsPrefix = qName === "xmlns" && "";
        }
        a.localName = localName;
        if (nsPrefix !== false) {
          if (localNSMap == null) {
            localNSMap = /* @__PURE__ */ Object.create(null);
            currentNSMap = Object.create(currentNSMap);
          }
          currentNSMap[nsPrefix] = localNSMap[nsPrefix] = value;
          a.uri = NAMESPACE.XMLNS;
          domBuilder.startPrefixMapping(nsPrefix, value);
        }
      }
      var i2 = el.length;
      while (i2--) {
        a = el[i2];
        if (a.prefix) {
          if (a.prefix === "xml") {
            a.uri = NAMESPACE.XML;
          }
          if (a.prefix !== "xmlns") {
            a.uri = currentNSMap[a.prefix];
          }
        }
      }
      var nsp = tagName.indexOf(":");
      if (nsp > 0) {
        prefix = el.prefix = tagName.slice(0, nsp);
        localName = el.localName = tagName.slice(nsp + 1);
      } else {
        prefix = null;
        localName = el.localName = tagName;
      }
      var ns = el.uri = currentNSMap[prefix || ""];
      domBuilder.startElement(ns, localName, tagName, el);
      if (el.closed) {
        domBuilder.endElement(ns, localName, tagName);
        if (localNSMap) {
          for (prefix in localNSMap) {
            if (hasOwn(localNSMap, prefix)) {
              domBuilder.endPrefixMapping(prefix);
            }
          }
        }
      } else {
        el.currentNSMap = currentNSMap;
        el.localNSMap = localNSMap;
        return true;
      }
    }
    function parseHtmlSpecialContent(source, elStartEnd, tagName, entityReplacer, domBuilder) {
      var isEscapableRaw = isHTMLEscapableRawTextElement(tagName);
      if (isEscapableRaw || isHTMLRawTextElement(tagName)) {
        var closeTag = new RegExp("</" + tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ">", "ig");
        closeTag.lastIndex = elStartEnd;
        var match = closeTag.exec(source);
        var elEndStart = match ? match.index : -1;
        if (elEndStart < 0) {
          return elStartEnd + 1;
        }
        var text = source.substring(elStartEnd + 1, elEndStart);
        if (isEscapableRaw) {
          text = text.replace(ENTITY_REG, entityReplacer);
        }
        domBuilder.characters(text, 0, text.length);
        return elEndStart;
      }
      return elStartEnd + 1;
    }
    function _copy(source, target) {
      for (var n in source) {
        if (hasOwn(source, n)) {
          target[n] = source[n];
        }
      }
    }
    function parseUtils(source, start) {
      var index = start;
      function char(n) {
        n = n || 0;
        return source.charAt(index + n);
      }
      function skip(n) {
        n = n || 1;
        index += n;
      }
      function skipBlanks() {
        var blanks = 0;
        while (index < source.length) {
          var c = char();
          if (c !== " " && c !== "\n" && c !== "	" && c !== "\r") {
            return blanks;
          }
          blanks++;
          skip();
        }
        return -1;
      }
      function substringFromIndex() {
        return source.substring(index);
      }
      function substringStartsWith(text) {
        return source.substring(index, index + text.length) === text;
      }
      function substringStartsWithCaseInsensitive(text) {
        return source.substring(index, index + text.length).toUpperCase() === text.toUpperCase();
      }
      function getMatch(args) {
        var expr = g.reg("^", args);
        var match = expr.exec(substringFromIndex());
        if (match) {
          skip(match[0].length);
          return match[0];
        }
        return null;
      }
      return {
        char,
        getIndex: function() {
          return index;
        },
        getMatch,
        getSource: function() {
          return source;
        },
        skip,
        skipBlanks,
        substringFromIndex,
        substringStartsWith,
        substringStartsWithCaseInsensitive
      };
    }
    function parseDoctypeInternalSubset(p, errorHandler) {
      function parsePI(p2, errorHandler2) {
        var match = g.PI.exec(p2.substringFromIndex());
        if (!match) {
          return errorHandler2.fatalError("processing instruction is not well-formed at position " + p2.getIndex());
        }
        if (match[1].toLowerCase() === "xml") {
          return errorHandler2.fatalError(
            "xml declaration is only allowed at the start of the document, but found at position " + p2.getIndex()
          );
        }
        p2.skip(match[0].length);
        return match[0];
      }
      var source = p.getSource();
      if (p.char() === "[") {
        p.skip(1);
        var intSubsetStart = p.getIndex();
        while (p.getIndex() < source.length) {
          p.skipBlanks();
          if (p.char() === "]") {
            var internalSubset = source.substring(intSubsetStart, p.getIndex());
            p.skip(1);
            return internalSubset;
          }
          var current = null;
          if (p.char() === "<" && p.char(1) === "!") {
            switch (p.char(2)) {
              case "E":
                if (p.char(3) === "L") {
                  current = p.getMatch(g.elementdecl);
                } else if (p.char(3) === "N") {
                  current = p.getMatch(g.EntityDecl);
                }
                break;
              case "A":
                current = p.getMatch(g.AttlistDecl);
                break;
              case "N":
                current = p.getMatch(g.NotationDecl);
                break;
              case "-":
                current = p.getMatch(g.Comment);
                break;
            }
          } else if (p.char() === "<" && p.char(1) === "?") {
            current = parsePI(p, errorHandler);
          } else if (p.char() === "%") {
            current = p.getMatch(g.PEReference);
          } else {
            return errorHandler.fatalError("Error detected in Markup declaration");
          }
          if (!current) {
            return errorHandler.fatalError("Error in internal subset at position " + p.getIndex());
          }
        }
        return errorHandler.fatalError("doctype internal subset is not well-formed, missing ]");
      }
    }
    function parseDoctypeCommentOrCData(source, start, domBuilder, errorHandler, isHTML) {
      var p = parseUtils(source, start);
      switch (isHTML ? p.char(2).toUpperCase() : p.char(2)) {
        case "-":
          var comment = p.getMatch(g.Comment);
          if (comment) {
            domBuilder.comment(comment, g.COMMENT_START.length, comment.length - g.COMMENT_START.length - g.COMMENT_END.length);
            return p.getIndex();
          } else {
            return errorHandler.fatalError("comment is not well-formed at position " + p.getIndex());
          }
        case "[":
          var cdata = p.getMatch(g.CDSect);
          if (cdata) {
            if (!isHTML && !domBuilder.currentElement) {
              return errorHandler.fatalError("CDATA outside of element");
            }
            domBuilder.startCDATA();
            domBuilder.characters(cdata, g.CDATA_START.length, cdata.length - g.CDATA_START.length - g.CDATA_END.length);
            domBuilder.endCDATA();
            return p.getIndex();
          } else {
            return errorHandler.fatalError("Invalid CDATA starting at position " + start);
          }
        case "D": {
          if (domBuilder.doc && domBuilder.doc.documentElement) {
            return errorHandler.fatalError("Doctype not allowed inside or after documentElement at position " + p.getIndex());
          }
          if (isHTML ? !p.substringStartsWithCaseInsensitive(g.DOCTYPE_DECL_START) : !p.substringStartsWith(g.DOCTYPE_DECL_START)) {
            return errorHandler.fatalError("Expected " + g.DOCTYPE_DECL_START + " at position " + p.getIndex());
          }
          p.skip(g.DOCTYPE_DECL_START.length);
          if (p.skipBlanks() < 1) {
            return errorHandler.fatalError("Expected whitespace after " + g.DOCTYPE_DECL_START + " at position " + p.getIndex());
          }
          var doctype = {
            name: void 0,
            publicId: void 0,
            systemId: void 0,
            internalSubset: void 0
          };
          doctype.name = p.getMatch(g.Name);
          if (!doctype.name)
            return errorHandler.fatalError("doctype name missing or contains unexpected characters at position " + p.getIndex());
          if (isHTML && doctype.name.toLowerCase() !== "html") {
            errorHandler.warning("Unexpected DOCTYPE in HTML document at position " + p.getIndex());
          }
          p.skipBlanks();
          if (p.substringStartsWith(g.PUBLIC) || p.substringStartsWith(g.SYSTEM)) {
            var match = g.ExternalID_match.exec(p.substringFromIndex());
            if (!match) {
              return errorHandler.fatalError("doctype external id is not well-formed at position " + p.getIndex());
            }
            if (match.groups.SystemLiteralOnly !== void 0) {
              doctype.systemId = match.groups.SystemLiteralOnly;
            } else {
              doctype.systemId = match.groups.SystemLiteral;
              doctype.publicId = match.groups.PubidLiteral;
            }
            p.skip(match[0].length);
          } else if (isHTML && p.substringStartsWithCaseInsensitive(g.SYSTEM)) {
            p.skip(g.SYSTEM.length);
            if (p.skipBlanks() < 1) {
              return errorHandler.fatalError("Expected whitespace after " + g.SYSTEM + " at position " + p.getIndex());
            }
            doctype.systemId = p.getMatch(g.ABOUT_LEGACY_COMPAT_SystemLiteral);
            if (!doctype.systemId) {
              return errorHandler.fatalError(
                "Expected " + g.ABOUT_LEGACY_COMPAT + " in single or double quotes after " + g.SYSTEM + " at position " + p.getIndex()
              );
            }
          }
          if (isHTML && doctype.systemId && !g.ABOUT_LEGACY_COMPAT_SystemLiteral.test(doctype.systemId)) {
            errorHandler.warning("Unexpected doctype.systemId in HTML document at position " + p.getIndex());
          }
          if (!isHTML) {
            p.skipBlanks();
            doctype.internalSubset = parseDoctypeInternalSubset(p, errorHandler);
          }
          p.skipBlanks();
          if (p.char() !== ">") {
            return errorHandler.fatalError("doctype not terminated with > at position " + p.getIndex());
          }
          p.skip(1);
          domBuilder.startDTD(doctype.name, doctype.publicId, doctype.systemId, doctype.internalSubset);
          domBuilder.endDTD();
          return p.getIndex();
        }
        default:
          return errorHandler.fatalError('Not well-formed XML starting with "<!" at position ' + start);
      }
    }
    function parseProcessingInstruction(source, start, domBuilder, errorHandler) {
      var match = source.substring(start).match(g.PI);
      if (!match) {
        return errorHandler.fatalError("Invalid processing instruction starting at position " + start);
      }
      if (match[1].toLowerCase() === "xml") {
        if (start > 0) {
          return errorHandler.fatalError(
            "processing instruction at position " + start + " is an xml declaration which is only at the start of the document"
          );
        }
        if (!g.XMLDecl.test(source.substring(start))) {
          return errorHandler.fatalError("xml declaration is not well-formed");
        }
      }
      domBuilder.processingInstruction(match[1], match[2]);
      return start + match[0].length;
    }
    function ElementAttributes() {
      this.attributeNames = /* @__PURE__ */ Object.create(null);
    }
    ElementAttributes.prototype = {
      setTagName: function(tagName) {
        if (!g.QName_exact.test(tagName)) {
          throw new Error("invalid tagName:" + tagName);
        }
        this.tagName = tagName;
      },
      addValue: function(qName, value, offset) {
        if (!g.QName_exact.test(qName)) {
          throw new Error("invalid attribute:" + qName);
        }
        this.attributeNames[qName] = this.length;
        this[this.length++] = { qName, value, offset };
      },
      length: 0,
      getLocalName: function(i2) {
        return this[i2].localName;
      },
      getLocator: function(i2) {
        return this[i2].locator;
      },
      getQName: function(i2) {
        return this[i2].qName;
      },
      getURI: function(i2) {
        return this[i2].uri;
      },
      getValue: function(i2) {
        return this[i2].value;
      }
      //	,getIndex:function(uri, localName)){
      //		if(localName){
      //
      //		}else{
      //			var qName = uri
      //		}
      //	},
      //	getValue:function(){return this.getValue(this.getIndex.apply(this,arguments))},
      //	getType:function(uri,localName){}
      //	getType:function(i){},
    };
    exports2.XMLReader = XMLReader;
    exports2.parseUtils = parseUtils;
    exports2.parseDoctypeCommentOrCData = parseDoctypeCommentOrCData;
  }
});

// node_modules/@xmldom/xmldom/lib/dom-parser.js
var require_dom_parser = __commonJS({
  "node_modules/@xmldom/xmldom/lib/dom-parser.js"(exports2) {
    "use strict";
    var conventions = require_conventions();
    var dom = require_dom();
    var errors = require_errors();
    var entities = require_entities();
    var sax = require_sax();
    var DOMImplementation = dom.DOMImplementation;
    var hasDefaultHTMLNamespace = conventions.hasDefaultHTMLNamespace;
    var isHTMLMimeType = conventions.isHTMLMimeType;
    var isValidMimeType = conventions.isValidMimeType;
    var MIME_TYPE = conventions.MIME_TYPE;
    var NAMESPACE = conventions.NAMESPACE;
    var ParseError = errors.ParseError;
    var XMLReader = sax.XMLReader;
    function normalizeLineEndings(input) {
      return input.replace(/\r[\n\u0085]/g, "\n").replace(/[\r\u0085\u2028\u2029]/g, "\n");
    }
    function DOMParser(options) {
      options = options || {};
      if (options.locator === void 0) {
        options.locator = true;
      }
      this.assign = options.assign || conventions.assign;
      this.domHandler = options.domHandler || DOMHandler;
      this.onError = options.onError || options.errorHandler;
      if (options.errorHandler && typeof options.errorHandler !== "function") {
        throw new TypeError("errorHandler object is no longer supported, switch to onError!");
      } else if (options.errorHandler) {
        options.errorHandler("warning", "The `errorHandler` option has been deprecated, use `onError` instead!", this);
      }
      this.normalizeLineEndings = options.normalizeLineEndings || normalizeLineEndings;
      this.locator = !!options.locator;
      this.xmlns = this.assign(/* @__PURE__ */ Object.create(null), options.xmlns);
    }
    DOMParser.prototype.parseFromString = function(source, mimeType) {
      if (!isValidMimeType(mimeType)) {
        throw new TypeError('DOMParser.parseFromString: the provided mimeType "' + mimeType + '" is not valid.');
      }
      var defaultNSMap = this.assign(/* @__PURE__ */ Object.create(null), this.xmlns);
      var entityMap = entities.XML_ENTITIES;
      var defaultNamespace = defaultNSMap[""] || null;
      if (hasDefaultHTMLNamespace(mimeType)) {
        entityMap = entities.HTML_ENTITIES;
        defaultNamespace = NAMESPACE.HTML;
      } else if (mimeType === MIME_TYPE.XML_SVG_IMAGE) {
        defaultNamespace = NAMESPACE.SVG;
      }
      defaultNSMap[""] = defaultNamespace;
      defaultNSMap.xml = defaultNSMap.xml || NAMESPACE.XML;
      var domBuilder = new this.domHandler({
        mimeType,
        defaultNamespace,
        onError: this.onError
      });
      var locator = this.locator ? {} : void 0;
      if (this.locator) {
        domBuilder.setDocumentLocator(locator);
      }
      var sax2 = new XMLReader();
      sax2.errorHandler = domBuilder;
      sax2.domBuilder = domBuilder;
      var isXml = !conventions.isHTMLMimeType(mimeType);
      if (isXml && typeof source !== "string") {
        sax2.errorHandler.fatalError("source is not a string");
      }
      sax2.parse(this.normalizeLineEndings(String(source)), defaultNSMap, entityMap);
      if (!domBuilder.doc.documentElement) {
        sax2.errorHandler.fatalError("missing root element");
      }
      return domBuilder.doc;
    };
    function DOMHandler(options) {
      var opt = options || {};
      this.mimeType = opt.mimeType || MIME_TYPE.XML_APPLICATION;
      this.defaultNamespace = opt.defaultNamespace || null;
      this.cdata = false;
      this.currentElement = void 0;
      this.doc = void 0;
      this.locator = void 0;
      this.onError = opt.onError;
    }
    function position(locator, node) {
      node.lineNumber = locator.lineNumber;
      node.columnNumber = locator.columnNumber;
    }
    DOMHandler.prototype = {
      /**
       * Either creates an XML or an HTML document and stores it under `this.doc`.
       * If it is an XML document, `this.defaultNamespace` is used to create it,
       * and it will not contain any `childNodes`.
       * If it is an HTML document, it will be created without any `childNodes`.
       *
       * @see http://www.saxproject.org/apidoc/org/xml/sax/ContentHandler.html
       */
      startDocument: function() {
        var impl = new DOMImplementation();
        this.doc = isHTMLMimeType(this.mimeType) ? impl.createHTMLDocument(false) : impl.createDocument(this.defaultNamespace, "");
      },
      startElement: function(namespaceURI, localName, qName, attrs) {
        var doc = this.doc;
        var el = doc.createElementNS(namespaceURI, qName || localName);
        var len = attrs.length;
        appendElement(this, el);
        this.currentElement = el;
        this.locator && position(this.locator, el);
        for (var i2 = 0; i2 < len; i2++) {
          var namespaceURI = attrs.getURI(i2);
          var value = attrs.getValue(i2);
          var qName = attrs.getQName(i2);
          var attr = doc.createAttributeNS(namespaceURI, qName);
          this.locator && position(attrs.getLocator(i2), attr);
          attr.value = attr.nodeValue = value;
          el.setAttributeNode(attr);
        }
      },
      endElement: function(namespaceURI, localName, qName) {
        this.currentElement = this.currentElement.parentNode;
      },
      startPrefixMapping: function(prefix, uri) {
      },
      endPrefixMapping: function(prefix) {
      },
      processingInstruction: function(target, data) {
        var ins = this.doc.createProcessingInstruction(target, data);
        this.locator && position(this.locator, ins);
        appendElement(this, ins);
      },
      ignorableWhitespace: function(ch, start, length) {
      },
      characters: function(chars, start, length) {
        chars = _toString.apply(this, arguments);
        if (chars) {
          if (this.cdata) {
            var charNode = this.doc.createCDATASection(chars);
          } else {
            var charNode = this.doc.createTextNode(chars);
          }
          if (this.currentElement) {
            this.currentElement.appendChild(charNode);
          } else if (/^\s*$/.test(chars)) {
            this.doc.appendChild(charNode);
          }
          this.locator && position(this.locator, charNode);
        }
      },
      skippedEntity: function(name) {
      },
      endDocument: function() {
        this.doc.normalize();
      },
      /**
       * Stores the locator to be able to set the `columnNumber` and `lineNumber`
       * on the created DOM nodes.
       *
       * @param {Locator} locator
       */
      setDocumentLocator: function(locator) {
        if (locator) {
          locator.lineNumber = 0;
        }
        this.locator = locator;
      },
      //LexicalHandler
      comment: function(chars, start, length) {
        chars = _toString.apply(this, arguments);
        var comm = this.doc.createComment(chars);
        this.locator && position(this.locator, comm);
        appendElement(this, comm);
      },
      startCDATA: function() {
        this.cdata = true;
      },
      endCDATA: function() {
        this.cdata = false;
      },
      startDTD: function(name, publicId, systemId, internalSubset) {
        var impl = this.doc.implementation;
        if (impl && impl.createDocumentType) {
          var dt = impl.createDocumentType(name, publicId, systemId, internalSubset);
          this.locator && position(this.locator, dt);
          appendElement(this, dt);
          this.doc.doctype = dt;
        }
      },
      reportError: function(level, message) {
        if (typeof this.onError === "function") {
          try {
            this.onError(level, message, this);
          } catch (e) {
            throw new ParseError("Reporting " + level + ' "' + message + '" caused ' + e, this.locator);
          }
        } else {
          console.error("[xmldom " + level + "]	" + message, _locator(this.locator));
        }
      },
      /**
       * @see http://www.saxproject.org/apidoc/org/xml/sax/ErrorHandler.html
       */
      warning: function(message) {
        this.reportError("warning", message);
      },
      error: function(message) {
        this.reportError("error", message);
      },
      /**
       * This function reports a fatal error and throws a ParseError.
       *
       * @param {string} message
       * - The message to be used for reporting and throwing the error.
       * @param {Error} [cause]
       * The error that caused this fatal error, preserved as the thrown `ParseError`'s `cause`.
       * @returns {never}
       * This function always throws an error and never returns a value.
       * @throws {ParseError}
       * Always throws a ParseError with the provided message.
       */
      fatalError: function(message, cause) {
        this.reportError("fatalError", message);
        throw new ParseError(message, this.locator, cause);
      }
    };
    function _locator(l) {
      if (l) {
        return "\n@#[line:" + l.lineNumber + ",col:" + l.columnNumber + "]";
      }
    }
    function _toString(chars, start, length) {
      if (typeof chars == "string") {
        return chars.substr(start, length);
      } else {
        if (chars.length >= start + length || start) {
          return new java.lang.String(chars, start, length) + "";
        }
        return chars;
      }
    }
    "endDTD,startEntity,endEntity,attributeDecl,elementDecl,externalEntityDecl,internalEntityDecl,resolveEntity,getExternalSubset,notationDecl,unparsedEntityDecl".replace(
      /\w+/g,
      function(key2) {
        DOMHandler.prototype[key2] = function() {
          return null;
        };
      }
    );
    function appendElement(handler, node) {
      if (!handler.currentElement) {
        handler.doc.appendChild(node);
      } else {
        handler.currentElement.appendChild(node);
      }
    }
    function onErrorStopParsing(level) {
      if (level === "error") throw "onErrorStopParsing";
    }
    function onWarningStopParsing() {
      throw "onWarningStopParsing";
    }
    exports2.__DOMHandler = DOMHandler;
    exports2.DOMParser = DOMParser;
    exports2.normalizeLineEndings = normalizeLineEndings;
    exports2.onErrorStopParsing = onErrorStopParsing;
    exports2.onWarningStopParsing = onWarningStopParsing;
  }
});

// node_modules/@xmldom/xmldom/lib/index.js
var require_lib = __commonJS({
  "node_modules/@xmldom/xmldom/lib/index.js"(exports2) {
    "use strict";
    var conventions = require_conventions();
    exports2.assign = conventions.assign;
    exports2.hasDefaultHTMLNamespace = conventions.hasDefaultHTMLNamespace;
    exports2.isHTMLMimeType = conventions.isHTMLMimeType;
    exports2.isValidMimeType = conventions.isValidMimeType;
    exports2.MIME_TYPE = conventions.MIME_TYPE;
    exports2.NAMESPACE = conventions.NAMESPACE;
    var errors = require_errors();
    exports2.DOMException = errors.DOMException;
    exports2.DOMExceptionName = errors.DOMExceptionName;
    exports2.ExceptionCode = errors.ExceptionCode;
    exports2.ParseError = errors.ParseError;
    var dom = require_dom();
    exports2.Attr = dom.Attr;
    exports2.CDATASection = dom.CDATASection;
    exports2.CharacterData = dom.CharacterData;
    exports2.Comment = dom.Comment;
    exports2.Document = dom.Document;
    exports2.DocumentFragment = dom.DocumentFragment;
    exports2.DocumentType = dom.DocumentType;
    exports2.DOMImplementation = dom.DOMImplementation;
    exports2.Element = dom.Element;
    exports2.Entity = dom.Entity;
    exports2.EntityReference = dom.EntityReference;
    exports2.LiveNodeList = dom.LiveNodeList;
    exports2.NamedNodeMap = dom.NamedNodeMap;
    exports2.Node = dom.Node;
    exports2.NodeList = dom.NodeList;
    exports2.Notation = dom.Notation;
    exports2.ProcessingInstruction = dom.ProcessingInstruction;
    exports2.Text = dom.Text;
    exports2.XMLSerializer = dom.XMLSerializer;
    var domParser = require_dom_parser();
    exports2.DOMParser = domParser.DOMParser;
    exports2.normalizeLineEndings = domParser.normalizeLineEndings;
    exports2.onErrorStopParsing = domParser.onErrorStopParsing;
    exports2.onWarningStopParsing = domParser.onWarningStopParsing;
  }
});

// node_modules/plist/lib/parse.js
var require_parse = __commonJS({
  "node_modules/plist/lib/parse.js"(exports2) {
    var { DOMParser } = require_lib();
    exports2.parse = parse;
    var TEXT_NODE = 3;
    var CDATA_NODE = 4;
    var COMMENT_NODE = 8;
    function shouldIgnoreNode(node) {
      return node.nodeType === TEXT_NODE || node.nodeType === COMMENT_NODE || node.nodeType === CDATA_NODE;
    }
    function isEmptyNode(node) {
      if (!node.childNodes || node.childNodes.length === 0) {
        return true;
      } else {
        return false;
      }
    }
    function invariant(test, message) {
      if (!test) {
        throw new Error(message);
      }
    }
    function parse(xml) {
      var doc = new DOMParser().parseFromString(xml, "text/xml");
      invariant(
        doc.documentElement.nodeName === "plist",
        "malformed document. First element should be <plist>"
      );
      var plist = parsePlistXML(doc.documentElement);
      if (plist.length == 1) plist = plist[0];
      return plist;
    }
    function parsePlistXML(node) {
      var i2, new_obj, key2, val, new_arr, res, counter, type;
      if (!node) return null;
      if (node.nodeName === "plist") {
        new_arr = [];
        if (isEmptyNode(node)) {
          return new_arr;
        }
        for (i2 = 0; i2 < node.childNodes.length; i2++) {
          if (!shouldIgnoreNode(node.childNodes[i2])) {
            new_arr.push(parsePlistXML(node.childNodes[i2]));
          }
        }
        return new_arr;
      } else if (node.nodeName === "dict") {
        new_obj = {};
        key2 = null;
        counter = 0;
        if (isEmptyNode(node)) {
          return new_obj;
        }
        for (i2 = 0; i2 < node.childNodes.length; i2++) {
          if (shouldIgnoreNode(node.childNodes[i2])) continue;
          if (counter % 2 === 0) {
            invariant(
              node.childNodes[i2].nodeName === "key",
              "Missing key while parsing <dict/>."
            );
            key2 = parsePlistXML(node.childNodes[i2]);
          } else {
            invariant(
              node.childNodes[i2].nodeName !== "key",
              'Unexpected key "' + parsePlistXML(node.childNodes[i2]) + '" while parsing <dict/>.'
            );
            new_obj[key2] = parsePlistXML(node.childNodes[i2]);
          }
          counter += 1;
        }
        if (counter % 2 === 1) {
          new_obj[key2] = "";
        }
        return new_obj;
      } else if (node.nodeName === "array") {
        new_arr = [];
        if (isEmptyNode(node)) {
          return new_arr;
        }
        for (i2 = 0; i2 < node.childNodes.length; i2++) {
          if (!shouldIgnoreNode(node.childNodes[i2])) {
            res = parsePlistXML(node.childNodes[i2]);
            if (null != res) new_arr.push(res);
          }
        }
        return new_arr;
      } else if (node.nodeName === "#text") {
      } else if (node.nodeName === "key") {
        if (isEmptyNode(node)) {
          return "";
        }
        invariant(
          node.childNodes[0].nodeValue !== "__proto__",
          "__proto__ keys can lead to prototype pollution. More details on CVE-2022-22912"
        );
        return node.childNodes[0].nodeValue;
      } else if (node.nodeName === "string") {
        res = "";
        if (isEmptyNode(node)) {
          return res;
        }
        for (i2 = 0; i2 < node.childNodes.length; i2++) {
          var type = node.childNodes[i2].nodeType;
          if (type === TEXT_NODE || type === CDATA_NODE) {
            res += node.childNodes[i2].nodeValue;
          }
        }
        return res;
      } else if (node.nodeName === "integer") {
        invariant(!isEmptyNode(node), 'Cannot parse "" as integer.');
        return parseInt(node.childNodes[0].nodeValue, 10);
      } else if (node.nodeName === "real") {
        invariant(!isEmptyNode(node), 'Cannot parse "" as real.');
        res = "";
        for (i2 = 0; i2 < node.childNodes.length; i2++) {
          if (node.childNodes[i2].nodeType === TEXT_NODE) {
            res += node.childNodes[i2].nodeValue;
          }
        }
        return parseFloat(res);
      } else if (node.nodeName === "data") {
        res = "";
        if (isEmptyNode(node)) {
          return Buffer.from(res, "base64");
        }
        for (i2 = 0; i2 < node.childNodes.length; i2++) {
          if (node.childNodes[i2].nodeType === TEXT_NODE) {
            res += node.childNodes[i2].nodeValue.replace(/\s+/g, "");
          }
        }
        return Buffer.from(res, "base64");
      } else if (node.nodeName === "date") {
        invariant(!isEmptyNode(node), 'Cannot parse "" as Date.');
        return new Date(node.childNodes[0].nodeValue);
      } else if (node.nodeName === "null") {
        return null;
      } else if (node.nodeName === "true") {
        return true;
      } else if (node.nodeName === "false") {
        return false;
      } else {
        throw new Error("Invalid PLIST tag " + node.nodeName);
      }
    }
  }
});

// node_modules/base64-js/index.js
var require_base64_js = __commonJS({
  "node_modules/base64-js/index.js"(exports2) {
    "use strict";
    exports2.byteLength = byteLength;
    exports2.toByteArray = toByteArray;
    exports2.fromByteArray = fromByteArray;
    var lookup = [];
    var revLookup = [];
    var Arr = typeof Uint8Array !== "undefined" ? Uint8Array : Array;
    var code = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    for (i2 = 0, len = code.length; i2 < len; ++i2) {
      lookup[i2] = code[i2];
      revLookup[code.charCodeAt(i2)] = i2;
    }
    var i2;
    var len;
    revLookup["-".charCodeAt(0)] = 62;
    revLookup["_".charCodeAt(0)] = 63;
    function getLens(b64) {
      var len2 = b64.length;
      if (len2 % 4 > 0) {
        throw new Error("Invalid string. Length must be a multiple of 4");
      }
      var validLen = b64.indexOf("=");
      if (validLen === -1) validLen = len2;
      var placeHoldersLen = validLen === len2 ? 0 : 4 - validLen % 4;
      return [validLen, placeHoldersLen];
    }
    function byteLength(b64) {
      var lens = getLens(b64);
      var validLen = lens[0];
      var placeHoldersLen = lens[1];
      return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
    }
    function _byteLength(b64, validLen, placeHoldersLen) {
      return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
    }
    function toByteArray(b64) {
      var tmp;
      var lens = getLens(b64);
      var validLen = lens[0];
      var placeHoldersLen = lens[1];
      var arr = new Arr(_byteLength(b64, validLen, placeHoldersLen));
      var curByte = 0;
      var len2 = placeHoldersLen > 0 ? validLen - 4 : validLen;
      var i3;
      for (i3 = 0; i3 < len2; i3 += 4) {
        tmp = revLookup[b64.charCodeAt(i3)] << 18 | revLookup[b64.charCodeAt(i3 + 1)] << 12 | revLookup[b64.charCodeAt(i3 + 2)] << 6 | revLookup[b64.charCodeAt(i3 + 3)];
        arr[curByte++] = tmp >> 16 & 255;
        arr[curByte++] = tmp >> 8 & 255;
        arr[curByte++] = tmp & 255;
      }
      if (placeHoldersLen === 2) {
        tmp = revLookup[b64.charCodeAt(i3)] << 2 | revLookup[b64.charCodeAt(i3 + 1)] >> 4;
        arr[curByte++] = tmp & 255;
      }
      if (placeHoldersLen === 1) {
        tmp = revLookup[b64.charCodeAt(i3)] << 10 | revLookup[b64.charCodeAt(i3 + 1)] << 4 | revLookup[b64.charCodeAt(i3 + 2)] >> 2;
        arr[curByte++] = tmp >> 8 & 255;
        arr[curByte++] = tmp & 255;
      }
      return arr;
    }
    function tripletToBase64(num) {
      return lookup[num >> 18 & 63] + lookup[num >> 12 & 63] + lookup[num >> 6 & 63] + lookup[num & 63];
    }
    function encodeChunk(uint8, start, end) {
      var tmp;
      var output = [];
      for (var i3 = start; i3 < end; i3 += 3) {
        tmp = (uint8[i3] << 16 & 16711680) + (uint8[i3 + 1] << 8 & 65280) + (uint8[i3 + 2] & 255);
        output.push(tripletToBase64(tmp));
      }
      return output.join("");
    }
    function fromByteArray(uint8) {
      var tmp;
      var len2 = uint8.length;
      var extraBytes = len2 % 3;
      var parts = [];
      var maxChunkLength = 16383;
      for (var i3 = 0, len22 = len2 - extraBytes; i3 < len22; i3 += maxChunkLength) {
        parts.push(encodeChunk(uint8, i3, i3 + maxChunkLength > len22 ? len22 : i3 + maxChunkLength));
      }
      if (extraBytes === 1) {
        tmp = uint8[len2 - 1];
        parts.push(
          lookup[tmp >> 2] + lookup[tmp << 4 & 63] + "=="
        );
      } else if (extraBytes === 2) {
        tmp = (uint8[len2 - 2] << 8) + uint8[len2 - 1];
        parts.push(
          lookup[tmp >> 10] + lookup[tmp >> 4 & 63] + lookup[tmp << 2 & 63] + "="
        );
      }
      return parts.join("");
    }
  }
});

// node_modules/xmlbuilder/lib/Utility.js
var require_Utility = __commonJS({
  "node_modules/xmlbuilder/lib/Utility.js"(exports2, module2) {
    (function() {
      var assign, getValue, isArray, isEmpty, isFunction, isObject, isPlainObject, hasProp = {}.hasOwnProperty;
      assign = function(target, ...sources) {
        var i2, key2, len, source;
        if (isFunction(Object.assign)) {
          Object.assign.apply(null, arguments);
        } else {
          for (i2 = 0, len = sources.length; i2 < len; i2++) {
            source = sources[i2];
            if (source != null) {
              for (key2 in source) {
                if (!hasProp.call(source, key2)) continue;
                target[key2] = source[key2];
              }
            }
          }
        }
        return target;
      };
      isFunction = function(val) {
        return !!val && Object.prototype.toString.call(val) === "[object Function]";
      };
      isObject = function(val) {
        var ref;
        return !!val && ((ref = typeof val) === "function" || ref === "object");
      };
      isArray = function(val) {
        if (isFunction(Array.isArray)) {
          return Array.isArray(val);
        } else {
          return Object.prototype.toString.call(val) === "[object Array]";
        }
      };
      isEmpty = function(val) {
        var key2;
        if (isArray(val)) {
          return !val.length;
        } else {
          for (key2 in val) {
            if (!hasProp.call(val, key2)) continue;
            return false;
          }
          return true;
        }
      };
      isPlainObject = function(val) {
        var ctor, proto;
        return isObject(val) && (proto = Object.getPrototypeOf(val)) && (ctor = proto.constructor) && typeof ctor === "function" && ctor instanceof ctor && Function.prototype.toString.call(ctor) === Function.prototype.toString.call(Object);
      };
      getValue = function(obj) {
        if (isFunction(obj.valueOf)) {
          return obj.valueOf();
        } else {
          return obj;
        }
      };
      module2.exports.assign = assign;
      module2.exports.isFunction = isFunction;
      module2.exports.isObject = isObject;
      module2.exports.isArray = isArray;
      module2.exports.isEmpty = isEmpty;
      module2.exports.isPlainObject = isPlainObject;
      module2.exports.getValue = getValue;
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLDOMImplementation.js
var require_XMLDOMImplementation = __commonJS({
  "node_modules/xmlbuilder/lib/XMLDOMImplementation.js"(exports2, module2) {
    (function() {
      var XMLDOMImplementation;
      module2.exports = XMLDOMImplementation = class XMLDOMImplementation {
        // Tests if the DOM implementation implements a specific feature.
        // `feature` package name of the feature to test. In Level 1, the
        //           legal values are "HTML" and "XML" (case-insensitive).
        // `version` version number of the package name to test.
        //           In Level 1, this is the string "1.0". If the version is
        //           not specified, supporting any version of the feature will
        //           cause the method to return true.
        hasFeature(feature, version) {
          return true;
        }
        // Creates a new document type declaration.
        // `qualifiedName` qualified name of the document type to be created
        // `publicId` public identifier of the external subset
        // `systemId` system identifier of the external subset
        createDocumentType(qualifiedName, publicId, systemId) {
          throw new Error("This DOM method is not implemented.");
        }
        // Creates a new document.
        // `namespaceURI` namespace URI of the document element to create
        // `qualifiedName` the qualified name of the document to be created
        // `doctype` the type of document to be created or null
        createDocument(namespaceURI, qualifiedName, doctype) {
          throw new Error("This DOM method is not implemented.");
        }
        // Creates a new HTML document.
        // `title` document title
        createHTMLDocument(title) {
          throw new Error("This DOM method is not implemented.");
        }
        // Returns a specialized object which implements the specialized APIs
        // of the specified feature and version.
        // `feature` name of the feature requested.
        // `version` version number of the feature to test
        getFeature(feature, version) {
          throw new Error("This DOM method is not implemented.");
        }
      };
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLDOMErrorHandler.js
var require_XMLDOMErrorHandler = __commonJS({
  "node_modules/xmlbuilder/lib/XMLDOMErrorHandler.js"(exports2, module2) {
    (function() {
      var XMLDOMErrorHandler;
      module2.exports = XMLDOMErrorHandler = class XMLDOMErrorHandler {
        // Initializes a new instance of `XMLDOMErrorHandler`
        constructor() {
        }
        // Called on the error handler when an error occurs.
        // `error` the error message as a string
        handleError(error) {
          throw new Error(error);
        }
      };
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLDOMStringList.js
var require_XMLDOMStringList = __commonJS({
  "node_modules/xmlbuilder/lib/XMLDOMStringList.js"(exports2, module2) {
    (function() {
      var XMLDOMStringList;
      module2.exports = XMLDOMStringList = (function() {
        class XMLDOMStringList2 {
          // Initializes a new instance of `XMLDOMStringList`
          // This is just a wrapper around an ordinary
          // JS array.
          // `arr` the array of string values
          constructor(arr) {
            this.arr = arr || [];
          }
          // Returns the indexth item in the collection.
          // `index` index into the collection
          item(index) {
            return this.arr[index] || null;
          }
          // Test if a string is part of this DOMStringList.
          // `str` the string to look for
          contains(str) {
            return this.arr.indexOf(str) !== -1;
          }
        }
        ;
        Object.defineProperty(XMLDOMStringList2.prototype, "length", {
          get: function() {
            return this.arr.length;
          }
        });
        return XMLDOMStringList2;
      }).call(this);
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLDOMConfiguration.js
var require_XMLDOMConfiguration = __commonJS({
  "node_modules/xmlbuilder/lib/XMLDOMConfiguration.js"(exports2, module2) {
    (function() {
      var XMLDOMConfiguration, XMLDOMErrorHandler, XMLDOMStringList;
      XMLDOMErrorHandler = require_XMLDOMErrorHandler();
      XMLDOMStringList = require_XMLDOMStringList();
      module2.exports = XMLDOMConfiguration = (function() {
        class XMLDOMConfiguration2 {
          constructor() {
            var clonedSelf;
            this.defaultParams = {
              "canonical-form": false,
              "cdata-sections": false,
              "comments": false,
              "datatype-normalization": false,
              "element-content-whitespace": true,
              "entities": true,
              "error-handler": new XMLDOMErrorHandler(),
              "infoset": true,
              "validate-if-schema": false,
              "namespaces": true,
              "namespace-declarations": true,
              "normalize-characters": false,
              "schema-location": "",
              "schema-type": "",
              "split-cdata-sections": true,
              "validate": false,
              "well-formed": true
            };
            this.params = clonedSelf = Object.create(this.defaultParams);
          }
          // Gets the value of a parameter.
          // `name` name of the parameter
          getParameter(name) {
            if (this.params.hasOwnProperty(name)) {
              return this.params[name];
            } else {
              return null;
            }
          }
          // Checks if setting a parameter to a specific value is supported.
          // `name` name of the parameter
          // `value` parameter value
          canSetParameter(name, value) {
            return true;
          }
          // Sets the value of a parameter.
          // `name` name of the parameter
          // `value` new value or null if the user wishes to unset the parameter
          setParameter(name, value) {
            if (value != null) {
              return this.params[name] = value;
            } else {
              return delete this.params[name];
            }
          }
        }
        ;
        Object.defineProperty(XMLDOMConfiguration2.prototype, "parameterNames", {
          get: function() {
            return new XMLDOMStringList(Object.keys(this.defaultParams));
          }
        });
        return XMLDOMConfiguration2;
      }).call(this);
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/NodeType.js
var require_NodeType = __commonJS({
  "node_modules/xmlbuilder/lib/NodeType.js"(exports2, module2) {
    (function() {
      module2.exports = {
        Element: 1,
        Attribute: 2,
        Text: 3,
        CData: 4,
        EntityReference: 5,
        EntityDeclaration: 6,
        ProcessingInstruction: 7,
        Comment: 8,
        Document: 9,
        DocType: 10,
        DocumentFragment: 11,
        NotationDeclaration: 12,
        // Numeric codes up to 200 are reserved to W3C for possible future use.
        // Following are types internal to this library:
        Declaration: 201,
        Raw: 202,
        AttributeDeclaration: 203,
        ElementDeclaration: 204,
        Dummy: 205
      };
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLAttribute.js
var require_XMLAttribute = __commonJS({
  "node_modules/xmlbuilder/lib/XMLAttribute.js"(exports2, module2) {
    (function() {
      var NodeType, XMLAttribute, XMLNode;
      NodeType = require_NodeType();
      XMLNode = require_XMLNode();
      module2.exports = XMLAttribute = (function() {
        class XMLAttribute2 {
          // Initializes a new instance of `XMLAttribute`
          // `parent` the parent node
          // `name` attribute target
          // `value` attribute value
          constructor(parent, name, value) {
            this.parent = parent;
            if (this.parent) {
              this.options = this.parent.options;
              this.stringify = this.parent.stringify;
            }
            if (name == null) {
              throw new Error("Missing attribute name. " + this.debugInfo(name));
            }
            this.name = this.stringify.name(name);
            this.value = this.stringify.attValue(value);
            this.type = NodeType.Attribute;
            this.isId = false;
            this.schemaTypeInfo = null;
          }
          // Creates and returns a deep clone of `this`
          clone() {
            return Object.create(this);
          }
          // Converts the XML fragment to string
          // `options.pretty` pretty prints the result
          // `options.indent` indentation for pretty print
          // `options.offset` how many indentations to add to every line for pretty print
          // `options.newline` newline sequence for pretty print
          toString(options) {
            return this.options.writer.attribute(this, this.options.writer.filterOptions(options));
          }
          // Returns debug string for this node
          debugInfo(name) {
            name = name || this.name;
            if (name == null) {
              return "parent: <" + this.parent.name + ">";
            } else {
              return "attribute: {" + name + "}, parent: <" + this.parent.name + ">";
            }
          }
          isEqualNode(node) {
            if (node.namespaceURI !== this.namespaceURI) {
              return false;
            }
            if (node.prefix !== this.prefix) {
              return false;
            }
            if (node.localName !== this.localName) {
              return false;
            }
            if (node.value !== this.value) {
              return false;
            }
            return true;
          }
        }
        ;
        Object.defineProperty(XMLAttribute2.prototype, "nodeType", {
          get: function() {
            return this.type;
          }
        });
        Object.defineProperty(XMLAttribute2.prototype, "ownerElement", {
          get: function() {
            return this.parent;
          }
        });
        Object.defineProperty(XMLAttribute2.prototype, "textContent", {
          get: function() {
            return this.value;
          },
          set: function(value) {
            return this.value = value || "";
          }
        });
        Object.defineProperty(XMLAttribute2.prototype, "namespaceURI", {
          get: function() {
            return "";
          }
        });
        Object.defineProperty(XMLAttribute2.prototype, "prefix", {
          get: function() {
            return "";
          }
        });
        Object.defineProperty(XMLAttribute2.prototype, "localName", {
          get: function() {
            return this.name;
          }
        });
        Object.defineProperty(XMLAttribute2.prototype, "specified", {
          get: function() {
            return true;
          }
        });
        return XMLAttribute2;
      }).call(this);
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLNamedNodeMap.js
var require_XMLNamedNodeMap = __commonJS({
  "node_modules/xmlbuilder/lib/XMLNamedNodeMap.js"(exports2, module2) {
    (function() {
      var XMLNamedNodeMap;
      module2.exports = XMLNamedNodeMap = (function() {
        class XMLNamedNodeMap2 {
          // Initializes a new instance of `XMLNamedNodeMap`
          // This is just a wrapper around an ordinary
          // JS object.
          // `nodes` the object containing nodes.
          constructor(nodes) {
            this.nodes = nodes;
          }
          // Creates and returns a deep clone of `this`
          clone() {
            return this.nodes = null;
          }
          // DOM Level 1
          getNamedItem(name) {
            return this.nodes[name];
          }
          setNamedItem(node) {
            var oldNode;
            oldNode = this.nodes[node.nodeName];
            this.nodes[node.nodeName] = node;
            return oldNode || null;
          }
          removeNamedItem(name) {
            var oldNode;
            oldNode = this.nodes[name];
            delete this.nodes[name];
            return oldNode || null;
          }
          item(index) {
            return this.nodes[Object.keys(this.nodes)[index]] || null;
          }
          // DOM level 2 functions to be implemented later
          getNamedItemNS(namespaceURI, localName) {
            throw new Error("This DOM method is not implemented.");
          }
          setNamedItemNS(node) {
            throw new Error("This DOM method is not implemented.");
          }
          removeNamedItemNS(namespaceURI, localName) {
            throw new Error("This DOM method is not implemented.");
          }
        }
        ;
        Object.defineProperty(XMLNamedNodeMap2.prototype, "length", {
          get: function() {
            return Object.keys(this.nodes).length || 0;
          }
        });
        return XMLNamedNodeMap2;
      }).call(this);
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLElement.js
var require_XMLElement = __commonJS({
  "node_modules/xmlbuilder/lib/XMLElement.js"(exports2, module2) {
    (function() {
      var NodeType, XMLAttribute, XMLElement, XMLNamedNodeMap, XMLNode, getValue, isFunction, isObject, hasProp = {}.hasOwnProperty;
      ({ isObject, isFunction, getValue } = require_Utility());
      XMLNode = require_XMLNode();
      NodeType = require_NodeType();
      XMLAttribute = require_XMLAttribute();
      XMLNamedNodeMap = require_XMLNamedNodeMap();
      module2.exports = XMLElement = (function() {
        class XMLElement2 extends XMLNode {
          // Initializes a new instance of `XMLElement`
          // `parent` the parent node
          // `name` element name
          // `attributes` an object containing name/value pairs of attributes
          constructor(parent, name, attributes) {
            var child, j, len, ref;
            super(parent);
            if (name == null) {
              throw new Error("Missing element name. " + this.debugInfo());
            }
            this.name = this.stringify.name(name);
            this.type = NodeType.Element;
            this.attribs = {};
            this.schemaTypeInfo = null;
            if (attributes != null) {
              this.attribute(attributes);
            }
            if (parent.type === NodeType.Document) {
              this.isRoot = true;
              this.documentObject = parent;
              parent.rootObject = this;
              if (parent.children) {
                ref = parent.children;
                for (j = 0, len = ref.length; j < len; j++) {
                  child = ref[j];
                  if (child.type === NodeType.DocType) {
                    child.name = this.name;
                    break;
                  }
                }
              }
            }
          }
          // Creates and returns a deep clone of `this`
          clone() {
            var att, attName, clonedSelf, ref;
            clonedSelf = Object.create(this);
            if (clonedSelf.isRoot) {
              clonedSelf.documentObject = null;
            }
            clonedSelf.attribs = {};
            ref = this.attribs;
            for (attName in ref) {
              if (!hasProp.call(ref, attName)) continue;
              att = ref[attName];
              clonedSelf.attribs[attName] = att.clone();
            }
            clonedSelf.children = [];
            this.children.forEach(function(child) {
              var clonedChild;
              clonedChild = child.clone();
              clonedChild.parent = clonedSelf;
              return clonedSelf.children.push(clonedChild);
            });
            return clonedSelf;
          }
          // Adds or modifies an attribute
          // `name` attribute name
          // `value` attribute value
          attribute(name, value) {
            var attName, attValue;
            if (name != null) {
              name = getValue(name);
            }
            if (isObject(name)) {
              for (attName in name) {
                if (!hasProp.call(name, attName)) continue;
                attValue = name[attName];
                this.attribute(attName, attValue);
              }
            } else {
              if (isFunction(value)) {
                value = value.apply();
              }
              if (this.options.keepNullAttributes && value == null) {
                this.attribs[name] = new XMLAttribute(this, name, "");
              } else if (value != null) {
                this.attribs[name] = new XMLAttribute(this, name, value);
              }
            }
            return this;
          }
          // Removes an attribute
          // `name` attribute name
          removeAttribute(name) {
            var attName, j, len;
            if (name == null) {
              throw new Error("Missing attribute name. " + this.debugInfo());
            }
            name = getValue(name);
            if (Array.isArray(name)) {
              for (j = 0, len = name.length; j < len; j++) {
                attName = name[j];
                delete this.attribs[attName];
              }
            } else {
              delete this.attribs[name];
            }
            return this;
          }
          // Converts the XML fragment to string
          // `options.pretty` pretty prints the result
          // `options.indent` indentation for pretty print
          // `options.offset` how many indentations to add to every line for pretty print
          // `options.newline` newline sequence for pretty print
          // `options.allowEmpty` do not self close empty element tags
          toString(options) {
            return this.options.writer.element(this, this.options.writer.filterOptions(options));
          }
          // Aliases
          att(name, value) {
            return this.attribute(name, value);
          }
          a(name, value) {
            return this.attribute(name, value);
          }
          // DOM Level 1
          getAttribute(name) {
            if (this.attribs.hasOwnProperty(name)) {
              return this.attribs[name].value;
            } else {
              return null;
            }
          }
          setAttribute(name, value) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          getAttributeNode(name) {
            if (this.attribs.hasOwnProperty(name)) {
              return this.attribs[name];
            } else {
              return null;
            }
          }
          setAttributeNode(newAttr) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          removeAttributeNode(oldAttr) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          getElementsByTagName(name) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          // DOM Level 2
          getAttributeNS(namespaceURI, localName) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          setAttributeNS(namespaceURI, qualifiedName, value) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          removeAttributeNS(namespaceURI, localName) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          getAttributeNodeNS(namespaceURI, localName) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          setAttributeNodeNS(newAttr) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          getElementsByTagNameNS(namespaceURI, localName) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          hasAttribute(name) {
            return this.attribs.hasOwnProperty(name);
          }
          hasAttributeNS(namespaceURI, localName) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          // DOM Level 3
          setIdAttribute(name, isId) {
            if (this.attribs.hasOwnProperty(name)) {
              return this.attribs[name].isId;
            } else {
              return isId;
            }
          }
          setIdAttributeNS(namespaceURI, localName, isId) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          setIdAttributeNode(idAttr, isId) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          // DOM Level 4
          getElementsByTagName(tagname) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          getElementsByTagNameNS(namespaceURI, localName) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          getElementsByClassName(classNames) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          isEqualNode(node) {
            var i2, j, ref;
            if (!super.isEqualNode(node)) {
              return false;
            }
            if (node.namespaceURI !== this.namespaceURI) {
              return false;
            }
            if (node.prefix !== this.prefix) {
              return false;
            }
            if (node.localName !== this.localName) {
              return false;
            }
            if (node.attribs.length !== this.attribs.length) {
              return false;
            }
            for (i2 = j = 0, ref = this.attribs.length - 1; 0 <= ref ? j <= ref : j >= ref; i2 = 0 <= ref ? ++j : --j) {
              if (!this.attribs[i2].isEqualNode(node.attribs[i2])) {
                return false;
              }
            }
            return true;
          }
        }
        ;
        Object.defineProperty(XMLElement2.prototype, "tagName", {
          get: function() {
            return this.name;
          }
        });
        Object.defineProperty(XMLElement2.prototype, "namespaceURI", {
          get: function() {
            return "";
          }
        });
        Object.defineProperty(XMLElement2.prototype, "prefix", {
          get: function() {
            return "";
          }
        });
        Object.defineProperty(XMLElement2.prototype, "localName", {
          get: function() {
            return this.name;
          }
        });
        Object.defineProperty(XMLElement2.prototype, "id", {
          get: function() {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
        });
        Object.defineProperty(XMLElement2.prototype, "className", {
          get: function() {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
        });
        Object.defineProperty(XMLElement2.prototype, "classList", {
          get: function() {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
        });
        Object.defineProperty(XMLElement2.prototype, "attributes", {
          get: function() {
            if (!this.attributeMap || !this.attributeMap.nodes) {
              this.attributeMap = new XMLNamedNodeMap(this.attribs);
            }
            return this.attributeMap;
          }
        });
        return XMLElement2;
      }).call(this);
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLCharacterData.js
var require_XMLCharacterData = __commonJS({
  "node_modules/xmlbuilder/lib/XMLCharacterData.js"(exports2, module2) {
    (function() {
      var XMLCharacterData, XMLNode;
      XMLNode = require_XMLNode();
      module2.exports = XMLCharacterData = (function() {
        class XMLCharacterData2 extends XMLNode {
          // Initializes a new instance of `XMLCharacterData`
          constructor(parent) {
            super(parent);
            this.value = "";
          }
          // Creates and returns a deep clone of `this`
          clone() {
            return Object.create(this);
          }
          // DOM level 1 functions to be implemented later
          substringData(offset, count) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          appendData(arg) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          insertData(offset, arg) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          deleteData(offset, count) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          replaceData(offset, count, arg) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          isEqualNode(node) {
            if (!super.isEqualNode(node)) {
              return false;
            }
            if (node.data !== this.data) {
              return false;
            }
            return true;
          }
        }
        ;
        Object.defineProperty(XMLCharacterData2.prototype, "data", {
          get: function() {
            return this.value;
          },
          set: function(value) {
            return this.value = value || "";
          }
        });
        Object.defineProperty(XMLCharacterData2.prototype, "length", {
          get: function() {
            return this.value.length;
          }
        });
        Object.defineProperty(XMLCharacterData2.prototype, "textContent", {
          get: function() {
            return this.value;
          },
          set: function(value) {
            return this.value = value || "";
          }
        });
        return XMLCharacterData2;
      }).call(this);
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLCData.js
var require_XMLCData = __commonJS({
  "node_modules/xmlbuilder/lib/XMLCData.js"(exports2, module2) {
    (function() {
      var NodeType, XMLCData, XMLCharacterData;
      NodeType = require_NodeType();
      XMLCharacterData = require_XMLCharacterData();
      module2.exports = XMLCData = class XMLCData extends XMLCharacterData {
        // Initializes a new instance of `XMLCData`
        // `text` CDATA text
        constructor(parent, text) {
          super(parent);
          if (text == null) {
            throw new Error("Missing CDATA text. " + this.debugInfo());
          }
          this.name = "#cdata-section";
          this.type = NodeType.CData;
          this.value = this.stringify.cdata(text);
        }
        // Creates and returns a deep clone of `this`
        clone() {
          return Object.create(this);
        }
        // Converts the XML fragment to string
        // `options.pretty` pretty prints the result
        // `options.indent` indentation for pretty print
        // `options.offset` how many indentations to add to every line for pretty print
        // `options.newline` newline sequence for pretty print
        toString(options) {
          return this.options.writer.cdata(this, this.options.writer.filterOptions(options));
        }
      };
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLComment.js
var require_XMLComment = __commonJS({
  "node_modules/xmlbuilder/lib/XMLComment.js"(exports2, module2) {
    (function() {
      var NodeType, XMLCharacterData, XMLComment;
      NodeType = require_NodeType();
      XMLCharacterData = require_XMLCharacterData();
      module2.exports = XMLComment = class XMLComment extends XMLCharacterData {
        // Initializes a new instance of `XMLComment`
        // `text` comment text
        constructor(parent, text) {
          super(parent);
          if (text == null) {
            throw new Error("Missing comment text. " + this.debugInfo());
          }
          this.name = "#comment";
          this.type = NodeType.Comment;
          this.value = this.stringify.comment(text);
        }
        // Creates and returns a deep clone of `this`
        clone() {
          return Object.create(this);
        }
        // Converts the XML fragment to string
        // `options.pretty` pretty prints the result
        // `options.indent` indentation for pretty print
        // `options.offset` how many indentations to add to every line for pretty print
        // `options.newline` newline sequence for pretty print
        toString(options) {
          return this.options.writer.comment(this, this.options.writer.filterOptions(options));
        }
      };
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLDeclaration.js
var require_XMLDeclaration = __commonJS({
  "node_modules/xmlbuilder/lib/XMLDeclaration.js"(exports2, module2) {
    (function() {
      var NodeType, XMLDeclaration, XMLNode, isObject;
      ({ isObject } = require_Utility());
      XMLNode = require_XMLNode();
      NodeType = require_NodeType();
      module2.exports = XMLDeclaration = class XMLDeclaration extends XMLNode {
        // Initializes a new instance of `XMLDeclaration`
        // `parent` the document object
        // `version` A version number string, e.g. 1.0
        // `encoding` Encoding declaration, e.g. UTF-8
        // `standalone` standalone document declaration: true or false
        constructor(parent, version, encoding, standalone) {
          super(parent);
          if (isObject(version)) {
            ({ version, encoding, standalone } = version);
          }
          if (!version) {
            version = "1.0";
          }
          this.type = NodeType.Declaration;
          this.version = this.stringify.xmlVersion(version);
          if (encoding != null) {
            this.encoding = this.stringify.xmlEncoding(encoding);
          }
          if (standalone != null) {
            this.standalone = this.stringify.xmlStandalone(standalone);
          }
        }
        // Converts to string
        // `options.pretty` pretty prints the result
        // `options.indent` indentation for pretty print
        // `options.offset` how many indentations to add to every line for pretty print
        // `options.newline` newline sequence for pretty print
        toString(options) {
          return this.options.writer.declaration(this, this.options.writer.filterOptions(options));
        }
      };
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLDTDAttList.js
var require_XMLDTDAttList = __commonJS({
  "node_modules/xmlbuilder/lib/XMLDTDAttList.js"(exports2, module2) {
    (function() {
      var NodeType, XMLDTDAttList, XMLNode;
      XMLNode = require_XMLNode();
      NodeType = require_NodeType();
      module2.exports = XMLDTDAttList = class XMLDTDAttList extends XMLNode {
        // Initializes a new instance of `XMLDTDAttList`
        // `parent` the parent `XMLDocType` element
        // `elementName` the name of the element containing this attribute
        // `attributeName` attribute name
        // `attributeType` type of the attribute
        // `defaultValueType` default value type (either #REQUIRED, #IMPLIED,
        //                    #FIXED or #DEFAULT)
        // `defaultValue` default value of the attribute
        //                (only used for #FIXED or #DEFAULT)
        constructor(parent, elementName, attributeName, attributeType, defaultValueType, defaultValue) {
          super(parent);
          if (elementName == null) {
            throw new Error("Missing DTD element name. " + this.debugInfo());
          }
          if (attributeName == null) {
            throw new Error("Missing DTD attribute name. " + this.debugInfo(elementName));
          }
          if (!attributeType) {
            throw new Error("Missing DTD attribute type. " + this.debugInfo(elementName));
          }
          if (!defaultValueType) {
            throw new Error("Missing DTD attribute default. " + this.debugInfo(elementName));
          }
          if (defaultValueType.indexOf("#") !== 0) {
            defaultValueType = "#" + defaultValueType;
          }
          if (!defaultValueType.match(/^(#REQUIRED|#IMPLIED|#FIXED|#DEFAULT)$/)) {
            throw new Error("Invalid default value type; expected: #REQUIRED, #IMPLIED, #FIXED or #DEFAULT. " + this.debugInfo(elementName));
          }
          if (defaultValue && !defaultValueType.match(/^(#FIXED|#DEFAULT)$/)) {
            throw new Error("Default value only applies to #FIXED or #DEFAULT. " + this.debugInfo(elementName));
          }
          this.elementName = this.stringify.name(elementName);
          this.type = NodeType.AttributeDeclaration;
          this.attributeName = this.stringify.name(attributeName);
          this.attributeType = this.stringify.dtdAttType(attributeType);
          if (defaultValue) {
            this.defaultValue = this.stringify.dtdAttDefault(defaultValue);
          }
          this.defaultValueType = defaultValueType;
        }
        // Converts the XML fragment to string
        // `options.pretty` pretty prints the result
        // `options.indent` indentation for pretty print
        // `options.offset` how many indentations to add to every line for pretty print
        // `options.newline` newline sequence for pretty print
        toString(options) {
          return this.options.writer.dtdAttList(this, this.options.writer.filterOptions(options));
        }
      };
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLDTDEntity.js
var require_XMLDTDEntity = __commonJS({
  "node_modules/xmlbuilder/lib/XMLDTDEntity.js"(exports2, module2) {
    (function() {
      var NodeType, XMLDTDEntity, XMLNode, isObject;
      ({ isObject } = require_Utility());
      XMLNode = require_XMLNode();
      NodeType = require_NodeType();
      module2.exports = XMLDTDEntity = (function() {
        class XMLDTDEntity2 extends XMLNode {
          // Initializes a new instance of `XMLDTDEntity`
          // `parent` the parent `XMLDocType` element
          // `pe` whether this is a parameter entity or a general entity
          //      defaults to `false` (general entity)
          // `name` the name of the entity
          // `value` internal entity value or an object with external entity details
          // `value.pubID` public identifier
          // `value.sysID` system identifier
          // `value.nData` notation declaration
          constructor(parent, pe, name, value) {
            super(parent);
            if (name == null) {
              throw new Error("Missing DTD entity name. " + this.debugInfo(name));
            }
            if (value == null) {
              throw new Error("Missing DTD entity value. " + this.debugInfo(name));
            }
            this.pe = !!pe;
            this.name = this.stringify.name(name);
            this.type = NodeType.EntityDeclaration;
            if (!isObject(value)) {
              this.value = this.stringify.dtdEntityValue(value);
              this.internal = true;
            } else {
              if (!value.pubID && !value.sysID) {
                throw new Error("Public and/or system identifiers are required for an external entity. " + this.debugInfo(name));
              }
              if (value.pubID && !value.sysID) {
                throw new Error("System identifier is required for a public external entity. " + this.debugInfo(name));
              }
              this.internal = false;
              if (value.pubID != null) {
                this.pubID = this.stringify.dtdPubID(value.pubID);
              }
              if (value.sysID != null) {
                this.sysID = this.stringify.dtdSysID(value.sysID);
              }
              if (value.nData != null) {
                this.nData = this.stringify.dtdNData(value.nData);
              }
              if (this.pe && this.nData) {
                throw new Error("Notation declaration is not allowed in a parameter entity. " + this.debugInfo(name));
              }
            }
          }
          // Converts the XML fragment to string
          // `options.pretty` pretty prints the result
          // `options.indent` indentation for pretty print
          // `options.offset` how many indentations to add to every line for pretty print
          // `options.newline` newline sequence for pretty print
          toString(options) {
            return this.options.writer.dtdEntity(this, this.options.writer.filterOptions(options));
          }
        }
        ;
        Object.defineProperty(XMLDTDEntity2.prototype, "publicId", {
          get: function() {
            return this.pubID;
          }
        });
        Object.defineProperty(XMLDTDEntity2.prototype, "systemId", {
          get: function() {
            return this.sysID;
          }
        });
        Object.defineProperty(XMLDTDEntity2.prototype, "notationName", {
          get: function() {
            return this.nData || null;
          }
        });
        Object.defineProperty(XMLDTDEntity2.prototype, "inputEncoding", {
          get: function() {
            return null;
          }
        });
        Object.defineProperty(XMLDTDEntity2.prototype, "xmlEncoding", {
          get: function() {
            return null;
          }
        });
        Object.defineProperty(XMLDTDEntity2.prototype, "xmlVersion", {
          get: function() {
            return null;
          }
        });
        return XMLDTDEntity2;
      }).call(this);
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLDTDElement.js
var require_XMLDTDElement = __commonJS({
  "node_modules/xmlbuilder/lib/XMLDTDElement.js"(exports2, module2) {
    (function() {
      var NodeType, XMLDTDElement, XMLNode;
      XMLNode = require_XMLNode();
      NodeType = require_NodeType();
      module2.exports = XMLDTDElement = class XMLDTDElement extends XMLNode {
        // Initializes a new instance of `XMLDTDElement`
        // `parent` the parent `XMLDocType` element
        // `name` element name
        // `value` element content (defaults to #PCDATA)
        constructor(parent, name, value) {
          super(parent);
          if (name == null) {
            throw new Error("Missing DTD element name. " + this.debugInfo());
          }
          if (!value) {
            value = "(#PCDATA)";
          }
          if (Array.isArray(value)) {
            value = "(" + value.join(",") + ")";
          }
          this.name = this.stringify.name(name);
          this.type = NodeType.ElementDeclaration;
          this.value = this.stringify.dtdElementValue(value);
        }
        // Converts the XML fragment to string
        // `options.pretty` pretty prints the result
        // `options.indent` indentation for pretty print
        // `options.offset` how many indentations to add to every line for pretty print
        // `options.newline` newline sequence for pretty print
        toString(options) {
          return this.options.writer.dtdElement(this, this.options.writer.filterOptions(options));
        }
      };
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLDTDNotation.js
var require_XMLDTDNotation = __commonJS({
  "node_modules/xmlbuilder/lib/XMLDTDNotation.js"(exports2, module2) {
    (function() {
      var NodeType, XMLDTDNotation, XMLNode;
      XMLNode = require_XMLNode();
      NodeType = require_NodeType();
      module2.exports = XMLDTDNotation = (function() {
        class XMLDTDNotation2 extends XMLNode {
          // Initializes a new instance of `XMLDTDNotation`
          // `parent` the parent `XMLDocType` element
          // `name` the name of the notation
          // `value` an object with external entity details
          // `value.pubID` public identifier
          // `value.sysID` system identifier
          constructor(parent, name, value) {
            super(parent);
            if (name == null) {
              throw new Error("Missing DTD notation name. " + this.debugInfo(name));
            }
            if (!value.pubID && !value.sysID) {
              throw new Error("Public or system identifiers are required for an external entity. " + this.debugInfo(name));
            }
            this.name = this.stringify.name(name);
            this.type = NodeType.NotationDeclaration;
            if (value.pubID != null) {
              this.pubID = this.stringify.dtdPubID(value.pubID);
            }
            if (value.sysID != null) {
              this.sysID = this.stringify.dtdSysID(value.sysID);
            }
          }
          // Converts the XML fragment to string
          // `options.pretty` pretty prints the result
          // `options.indent` indentation for pretty print
          // `options.offset` how many indentations to add to every line for pretty print
          // `options.newline` newline sequence for pretty print
          toString(options) {
            return this.options.writer.dtdNotation(this, this.options.writer.filterOptions(options));
          }
        }
        ;
        Object.defineProperty(XMLDTDNotation2.prototype, "publicId", {
          get: function() {
            return this.pubID;
          }
        });
        Object.defineProperty(XMLDTDNotation2.prototype, "systemId", {
          get: function() {
            return this.sysID;
          }
        });
        return XMLDTDNotation2;
      }).call(this);
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLDocType.js
var require_XMLDocType = __commonJS({
  "node_modules/xmlbuilder/lib/XMLDocType.js"(exports2, module2) {
    (function() {
      var NodeType, XMLDTDAttList, XMLDTDElement, XMLDTDEntity, XMLDTDNotation, XMLDocType, XMLNamedNodeMap, XMLNode, isObject;
      ({ isObject } = require_Utility());
      XMLNode = require_XMLNode();
      NodeType = require_NodeType();
      XMLDTDAttList = require_XMLDTDAttList();
      XMLDTDEntity = require_XMLDTDEntity();
      XMLDTDElement = require_XMLDTDElement();
      XMLDTDNotation = require_XMLDTDNotation();
      XMLNamedNodeMap = require_XMLNamedNodeMap();
      module2.exports = XMLDocType = (function() {
        class XMLDocType2 extends XMLNode {
          // Initializes a new instance of `XMLDocType`
          // `parent` the document object
          // `pubID` public identifier of the external subset
          // `sysID` system identifier of the external subset
          constructor(parent, pubID, sysID) {
            var child, i2, len, ref;
            super(parent);
            this.type = NodeType.DocType;
            if (parent.children) {
              ref = parent.children;
              for (i2 = 0, len = ref.length; i2 < len; i2++) {
                child = ref[i2];
                if (child.type === NodeType.Element) {
                  this.name = child.name;
                  break;
                }
              }
            }
            this.documentObject = parent;
            if (isObject(pubID)) {
              ({ pubID, sysID } = pubID);
            }
            if (sysID == null) {
              [sysID, pubID] = [pubID, sysID];
            }
            if (pubID != null) {
              this.pubID = this.stringify.dtdPubID(pubID);
            }
            if (sysID != null) {
              this.sysID = this.stringify.dtdSysID(sysID);
            }
          }
          // Creates an element type declaration
          // `name` element name
          // `value` element content (defaults to #PCDATA)
          element(name, value) {
            var child;
            child = new XMLDTDElement(this, name, value);
            this.children.push(child);
            return this;
          }
          // Creates an attribute declaration
          // `elementName` the name of the element containing this attribute
          // `attributeName` attribute name
          // `attributeType` type of the attribute (defaults to CDATA)
          // `defaultValueType` default value type (either #REQUIRED, #IMPLIED, #FIXED or
          //                    #DEFAULT) (defaults to #IMPLIED)
          // `defaultValue` default value of the attribute
          //                (only used for #FIXED or #DEFAULT)
          attList(elementName, attributeName, attributeType, defaultValueType, defaultValue) {
            var child;
            child = new XMLDTDAttList(this, elementName, attributeName, attributeType, defaultValueType, defaultValue);
            this.children.push(child);
            return this;
          }
          // Creates a general entity declaration
          // `name` the name of the entity
          // `value` internal entity value or an object with external entity details
          // `value.pubID` public identifier
          // `value.sysID` system identifier
          // `value.nData` notation declaration
          entity(name, value) {
            var child;
            child = new XMLDTDEntity(this, false, name, value);
            this.children.push(child);
            return this;
          }
          // Creates a parameter entity declaration
          // `name` the name of the entity
          // `value` internal entity value or an object with external entity details
          // `value.pubID` public identifier
          // `value.sysID` system identifier
          pEntity(name, value) {
            var child;
            child = new XMLDTDEntity(this, true, name, value);
            this.children.push(child);
            return this;
          }
          // Creates a NOTATION declaration
          // `name` the name of the notation
          // `value` an object with external entity details
          // `value.pubID` public identifier
          // `value.sysID` system identifier
          notation(name, value) {
            var child;
            child = new XMLDTDNotation(this, name, value);
            this.children.push(child);
            return this;
          }
          // Converts to string
          // `options.pretty` pretty prints the result
          // `options.indent` indentation for pretty print
          // `options.offset` how many indentations to add to every line for pretty print
          // `options.newline` newline sequence for pretty print
          toString(options) {
            return this.options.writer.docType(this, this.options.writer.filterOptions(options));
          }
          // Aliases
          ele(name, value) {
            return this.element(name, value);
          }
          att(elementName, attributeName, attributeType, defaultValueType, defaultValue) {
            return this.attList(elementName, attributeName, attributeType, defaultValueType, defaultValue);
          }
          ent(name, value) {
            return this.entity(name, value);
          }
          pent(name, value) {
            return this.pEntity(name, value);
          }
          not(name, value) {
            return this.notation(name, value);
          }
          up() {
            return this.root() || this.documentObject;
          }
          isEqualNode(node) {
            if (!super.isEqualNode(node)) {
              return false;
            }
            if (node.name !== this.name) {
              return false;
            }
            if (node.publicId !== this.publicId) {
              return false;
            }
            if (node.systemId !== this.systemId) {
              return false;
            }
            return true;
          }
        }
        ;
        Object.defineProperty(XMLDocType2.prototype, "entities", {
          get: function() {
            var child, i2, len, nodes, ref;
            nodes = {};
            ref = this.children;
            for (i2 = 0, len = ref.length; i2 < len; i2++) {
              child = ref[i2];
              if (child.type === NodeType.EntityDeclaration && !child.pe) {
                nodes[child.name] = child;
              }
            }
            return new XMLNamedNodeMap(nodes);
          }
        });
        Object.defineProperty(XMLDocType2.prototype, "notations", {
          get: function() {
            var child, i2, len, nodes, ref;
            nodes = {};
            ref = this.children;
            for (i2 = 0, len = ref.length; i2 < len; i2++) {
              child = ref[i2];
              if (child.type === NodeType.NotationDeclaration) {
                nodes[child.name] = child;
              }
            }
            return new XMLNamedNodeMap(nodes);
          }
        });
        Object.defineProperty(XMLDocType2.prototype, "publicId", {
          get: function() {
            return this.pubID;
          }
        });
        Object.defineProperty(XMLDocType2.prototype, "systemId", {
          get: function() {
            return this.sysID;
          }
        });
        Object.defineProperty(XMLDocType2.prototype, "internalSubset", {
          get: function() {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
        });
        return XMLDocType2;
      }).call(this);
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLRaw.js
var require_XMLRaw = __commonJS({
  "node_modules/xmlbuilder/lib/XMLRaw.js"(exports2, module2) {
    (function() {
      var NodeType, XMLNode, XMLRaw;
      NodeType = require_NodeType();
      XMLNode = require_XMLNode();
      module2.exports = XMLRaw = class XMLRaw extends XMLNode {
        // Initializes a new instance of `XMLRaw`
        // `text` raw text
        constructor(parent, text) {
          super(parent);
          if (text == null) {
            throw new Error("Missing raw text. " + this.debugInfo());
          }
          this.type = NodeType.Raw;
          this.value = this.stringify.raw(text);
        }
        // Creates and returns a deep clone of `this`
        clone() {
          return Object.create(this);
        }
        // Converts the XML fragment to string
        // `options.pretty` pretty prints the result
        // `options.indent` indentation for pretty print
        // `options.offset` how many indentations to add to every line for pretty print
        // `options.newline` newline sequence for pretty print
        toString(options) {
          return this.options.writer.raw(this, this.options.writer.filterOptions(options));
        }
      };
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLText.js
var require_XMLText = __commonJS({
  "node_modules/xmlbuilder/lib/XMLText.js"(exports2, module2) {
    (function() {
      var NodeType, XMLCharacterData, XMLText;
      NodeType = require_NodeType();
      XMLCharacterData = require_XMLCharacterData();
      module2.exports = XMLText = (function() {
        class XMLText2 extends XMLCharacterData {
          // Initializes a new instance of `XMLText`
          // `text` element text
          constructor(parent, text) {
            super(parent);
            if (text == null) {
              throw new Error("Missing element text. " + this.debugInfo());
            }
            this.name = "#text";
            this.type = NodeType.Text;
            this.value = this.stringify.text(text);
          }
          // Creates and returns a deep clone of `this`
          clone() {
            return Object.create(this);
          }
          // Converts the XML fragment to string
          // `options.pretty` pretty prints the result
          // `options.indent` indentation for pretty print
          // `options.offset` how many indentations to add to every line for pretty print
          // `options.newline` newline sequence for pretty print
          toString(options) {
            return this.options.writer.text(this, this.options.writer.filterOptions(options));
          }
          // DOM level 1 functions to be implemented later
          splitText(offset) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          // DOM level 3 functions to be implemented later
          replaceWholeText(content) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
        }
        ;
        Object.defineProperty(XMLText2.prototype, "isElementContentWhitespace", {
          get: function() {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
        });
        Object.defineProperty(XMLText2.prototype, "wholeText", {
          get: function() {
            var next, prev, str;
            str = "";
            prev = this.previousSibling;
            while (prev) {
              str = prev.data + str;
              prev = prev.previousSibling;
            }
            str += this.data;
            next = this.nextSibling;
            while (next) {
              str = str + next.data;
              next = next.nextSibling;
            }
            return str;
          }
        });
        return XMLText2;
      }).call(this);
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLProcessingInstruction.js
var require_XMLProcessingInstruction = __commonJS({
  "node_modules/xmlbuilder/lib/XMLProcessingInstruction.js"(exports2, module2) {
    (function() {
      var NodeType, XMLCharacterData, XMLProcessingInstruction;
      NodeType = require_NodeType();
      XMLCharacterData = require_XMLCharacterData();
      module2.exports = XMLProcessingInstruction = class XMLProcessingInstruction extends XMLCharacterData {
        // Initializes a new instance of `XMLProcessingInstruction`
        // `parent` the parent node
        // `target` instruction target
        // `value` instruction value
        constructor(parent, target, value) {
          super(parent);
          if (target == null) {
            throw new Error("Missing instruction target. " + this.debugInfo());
          }
          this.type = NodeType.ProcessingInstruction;
          this.target = this.stringify.insTarget(target);
          this.name = this.target;
          if (value) {
            this.value = this.stringify.insValue(value);
          }
        }
        // Creates and returns a deep clone of `this`
        clone() {
          return Object.create(this);
        }
        // Converts the XML fragment to string
        // `options.pretty` pretty prints the result
        // `options.indent` indentation for pretty print
        // `options.offset` how many indentations to add to every line for pretty print
        // `options.newline` newline sequence for pretty print
        toString(options) {
          return this.options.writer.processingInstruction(this, this.options.writer.filterOptions(options));
        }
        isEqualNode(node) {
          if (!super.isEqualNode(node)) {
            return false;
          }
          if (node.target !== this.target) {
            return false;
          }
          return true;
        }
      };
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLDummy.js
var require_XMLDummy = __commonJS({
  "node_modules/xmlbuilder/lib/XMLDummy.js"(exports2, module2) {
    (function() {
      var NodeType, XMLDummy, XMLNode;
      XMLNode = require_XMLNode();
      NodeType = require_NodeType();
      module2.exports = XMLDummy = class XMLDummy extends XMLNode {
        // Initializes a new instance of `XMLDummy`
        // `XMLDummy` is a special node representing a node with
        // a null value. Dummy nodes are created while recursively
        // building the XML tree. Simply skipping null values doesn't
        // work because that would break the recursive chain.
        constructor(parent) {
          super(parent);
          this.type = NodeType.Dummy;
        }
        // Creates and returns a deep clone of `this`
        clone() {
          return Object.create(this);
        }
        // Converts the XML fragment to string
        // `options.pretty` pretty prints the result
        // `options.indent` indentation for pretty print
        // `options.offset` how many indentations to add to every line for pretty print
        // `options.newline` newline sequence for pretty print
        toString(options) {
          return "";
        }
      };
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLNodeList.js
var require_XMLNodeList = __commonJS({
  "node_modules/xmlbuilder/lib/XMLNodeList.js"(exports2, module2) {
    (function() {
      var XMLNodeList;
      module2.exports = XMLNodeList = (function() {
        class XMLNodeList2 {
          // Initializes a new instance of `XMLNodeList`
          // This is just a wrapper around an ordinary
          // JS array.
          // `nodes` the array containing nodes.
          constructor(nodes) {
            this.nodes = nodes;
          }
          // Creates and returns a deep clone of `this`
          clone() {
            return this.nodes = null;
          }
          // DOM Level 1
          item(index) {
            return this.nodes[index] || null;
          }
        }
        ;
        Object.defineProperty(XMLNodeList2.prototype, "length", {
          get: function() {
            return this.nodes.length || 0;
          }
        });
        return XMLNodeList2;
      }).call(this);
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/DocumentPosition.js
var require_DocumentPosition = __commonJS({
  "node_modules/xmlbuilder/lib/DocumentPosition.js"(exports2, module2) {
    (function() {
      module2.exports = {
        Disconnected: 1,
        Preceding: 2,
        Following: 4,
        Contains: 8,
        ContainedBy: 16,
        ImplementationSpecific: 32
      };
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLNode.js
var require_XMLNode = __commonJS({
  "node_modules/xmlbuilder/lib/XMLNode.js"(exports2, module2) {
    (function() {
      var DocumentPosition, NodeType, XMLCData, XMLComment, XMLDeclaration, XMLDocType, XMLDummy, XMLElement, XMLNamedNodeMap, XMLNode, XMLNodeList, XMLProcessingInstruction, XMLRaw, XMLText, getValue, isEmpty, isFunction, isObject, hasProp = {}.hasOwnProperty, splice = [].splice;
      ({ isObject, isFunction, isEmpty, getValue } = require_Utility());
      XMLElement = null;
      XMLCData = null;
      XMLComment = null;
      XMLDeclaration = null;
      XMLDocType = null;
      XMLRaw = null;
      XMLText = null;
      XMLProcessingInstruction = null;
      XMLDummy = null;
      NodeType = null;
      XMLNodeList = null;
      XMLNamedNodeMap = null;
      DocumentPosition = null;
      module2.exports = XMLNode = (function() {
        class XMLNode2 {
          // Initializes a new instance of `XMLNode`
          // `parent` the parent node
          constructor(parent1) {
            this.parent = parent1;
            if (this.parent) {
              this.options = this.parent.options;
              this.stringify = this.parent.stringify;
            }
            this.value = null;
            this.children = [];
            this.baseURI = null;
            if (!XMLElement) {
              XMLElement = require_XMLElement();
              XMLCData = require_XMLCData();
              XMLComment = require_XMLComment();
              XMLDeclaration = require_XMLDeclaration();
              XMLDocType = require_XMLDocType();
              XMLRaw = require_XMLRaw();
              XMLText = require_XMLText();
              XMLProcessingInstruction = require_XMLProcessingInstruction();
              XMLDummy = require_XMLDummy();
              NodeType = require_NodeType();
              XMLNodeList = require_XMLNodeList();
              XMLNamedNodeMap = require_XMLNamedNodeMap();
              DocumentPosition = require_DocumentPosition();
            }
          }
          // Sets the parent node of this node and its children recursively
          // `parent` the parent node
          setParent(parent) {
            var child, j, len, ref1, results;
            this.parent = parent;
            if (parent) {
              this.options = parent.options;
              this.stringify = parent.stringify;
            }
            ref1 = this.children;
            results = [];
            for (j = 0, len = ref1.length; j < len; j++) {
              child = ref1[j];
              results.push(child.setParent(this));
            }
            return results;
          }
          // Creates a child element node
          // `name` node name or an object describing the XML tree
          // `attributes` an object containing name/value pairs of attributes
          // `text` element text
          element(name, attributes, text) {
            var childNode, item, j, k, key2, lastChild, len, len1, val;
            lastChild = null;
            if (attributes === null && text == null) {
              [attributes, text] = [{}, null];
            }
            if (attributes == null) {
              attributes = {};
            }
            attributes = getValue(attributes);
            if (!isObject(attributes)) {
              [text, attributes] = [attributes, text];
            }
            if (name != null) {
              name = getValue(name);
            }
            if (Array.isArray(name)) {
              for (j = 0, len = name.length; j < len; j++) {
                item = name[j];
                lastChild = this.element(item);
              }
            } else if (isFunction(name)) {
              lastChild = this.element(name.apply());
            } else if (isObject(name)) {
              for (key2 in name) {
                if (!hasProp.call(name, key2)) continue;
                val = name[key2];
                if (isFunction(val)) {
                  val = val.apply();
                }
                if (!this.options.ignoreDecorators && this.stringify.convertAttKey && key2.indexOf(this.stringify.convertAttKey) === 0) {
                  lastChild = this.attribute(key2.substr(this.stringify.convertAttKey.length), val);
                } else if (!this.options.separateArrayItems && Array.isArray(val) && isEmpty(val)) {
                  lastChild = this.dummy();
                } else if (isObject(val) && isEmpty(val)) {
                  lastChild = this.element(key2);
                } else if (!this.options.keepNullNodes && val == null) {
                  lastChild = this.dummy();
                } else if (!this.options.separateArrayItems && Array.isArray(val)) {
                  for (k = 0, len1 = val.length; k < len1; k++) {
                    item = val[k];
                    childNode = {};
                    childNode[key2] = item;
                    lastChild = this.element(childNode);
                  }
                } else if (isObject(val)) {
                  if (!this.options.ignoreDecorators && this.stringify.convertTextKey && key2.indexOf(this.stringify.convertTextKey) === 0) {
                    lastChild = this.element(val);
                  } else {
                    lastChild = this.element(key2);
                    lastChild.element(val);
                  }
                } else {
                  lastChild = this.element(key2, val);
                }
              }
            } else if (!this.options.keepNullNodes && text === null) {
              lastChild = this.dummy();
            } else {
              if (!this.options.ignoreDecorators && this.stringify.convertTextKey && name.indexOf(this.stringify.convertTextKey) === 0) {
                lastChild = this.text(text);
              } else if (!this.options.ignoreDecorators && this.stringify.convertCDataKey && name.indexOf(this.stringify.convertCDataKey) === 0) {
                lastChild = this.cdata(text);
              } else if (!this.options.ignoreDecorators && this.stringify.convertCommentKey && name.indexOf(this.stringify.convertCommentKey) === 0) {
                lastChild = this.comment(text);
              } else if (!this.options.ignoreDecorators && this.stringify.convertRawKey && name.indexOf(this.stringify.convertRawKey) === 0) {
                lastChild = this.raw(text);
              } else if (!this.options.ignoreDecorators && this.stringify.convertPIKey && name.indexOf(this.stringify.convertPIKey) === 0) {
                lastChild = this.instruction(name.substr(this.stringify.convertPIKey.length), text);
              } else {
                lastChild = this.node(name, attributes, text);
              }
            }
            if (lastChild == null) {
              throw new Error("Could not create any elements with: " + name + ". " + this.debugInfo());
            }
            return lastChild;
          }
          // Creates a child element node before the current node
          // `name` node name or an object describing the XML tree
          // `attributes` an object containing name/value pairs of attributes
          // `text` element text
          insertBefore(name, attributes, text) {
            var child, i2, newChild, refChild, removed;
            if (name != null ? name.type : void 0) {
              newChild = name;
              refChild = attributes;
              newChild.setParent(this);
              if (refChild) {
                i2 = children.indexOf(refChild);
                removed = children.splice(i2);
                children.push(newChild);
                Array.prototype.push.apply(children, removed);
              } else {
                children.push(newChild);
              }
              return newChild;
            } else {
              if (this.isRoot) {
                throw new Error("Cannot insert elements at root level. " + this.debugInfo(name));
              }
              i2 = this.parent.children.indexOf(this);
              removed = this.parent.children.splice(i2);
              child = this.parent.element(name, attributes, text);
              Array.prototype.push.apply(this.parent.children, removed);
              return child;
            }
          }
          // Creates a child element node after the current node
          // `name` node name or an object describing the XML tree
          // `attributes` an object containing name/value pairs of attributes
          // `text` element text
          insertAfter(name, attributes, text) {
            var child, i2, removed;
            if (this.isRoot) {
              throw new Error("Cannot insert elements at root level. " + this.debugInfo(name));
            }
            i2 = this.parent.children.indexOf(this);
            removed = this.parent.children.splice(i2 + 1);
            child = this.parent.element(name, attributes, text);
            Array.prototype.push.apply(this.parent.children, removed);
            return child;
          }
          // Deletes a child element node
          remove() {
            var i2, ref1;
            if (this.isRoot) {
              throw new Error("Cannot remove the root element. " + this.debugInfo());
            }
            i2 = this.parent.children.indexOf(this);
            splice.apply(this.parent.children, [i2, i2 - i2 + 1].concat(ref1 = [])), ref1;
            return this.parent;
          }
          // Creates a node
          // `name` name of the node
          // `attributes` an object containing name/value pairs of attributes
          // `text` element text
          node(name, attributes, text) {
            var child;
            if (name != null) {
              name = getValue(name);
            }
            attributes || (attributes = {});
            attributes = getValue(attributes);
            if (!isObject(attributes)) {
              [text, attributes] = [attributes, text];
            }
            child = new XMLElement(this, name, attributes);
            if (text != null) {
              child.text(text);
            }
            this.children.push(child);
            return child;
          }
          // Creates a text node
          // `value` element text
          text(value) {
            var child;
            if (isObject(value)) {
              this.element(value);
            }
            child = new XMLText(this, value);
            this.children.push(child);
            return this;
          }
          // Creates a CDATA node
          // `value` element text without CDATA delimiters
          cdata(value) {
            var child;
            child = new XMLCData(this, value);
            this.children.push(child);
            return this;
          }
          // Creates a comment node
          // `value` comment text
          comment(value) {
            var child;
            child = new XMLComment(this, value);
            this.children.push(child);
            return this;
          }
          // Creates a comment node before the current node
          // `value` comment text
          commentBefore(value) {
            var child, i2, removed;
            i2 = this.parent.children.indexOf(this);
            removed = this.parent.children.splice(i2);
            child = this.parent.comment(value);
            Array.prototype.push.apply(this.parent.children, removed);
            return this;
          }
          // Creates a comment node after the current node
          // `value` comment text
          commentAfter(value) {
            var child, i2, removed;
            i2 = this.parent.children.indexOf(this);
            removed = this.parent.children.splice(i2 + 1);
            child = this.parent.comment(value);
            Array.prototype.push.apply(this.parent.children, removed);
            return this;
          }
          // Adds unescaped raw text
          // `value` text
          raw(value) {
            var child;
            child = new XMLRaw(this, value);
            this.children.push(child);
            return this;
          }
          // Adds a dummy node
          dummy() {
            var child;
            child = new XMLDummy(this);
            return child;
          }
          // Adds a processing instruction
          // `target` instruction target
          // `value` instruction value
          instruction(target, value) {
            var insTarget, insValue, instruction, j, len;
            if (target != null) {
              target = getValue(target);
            }
            if (value != null) {
              value = getValue(value);
            }
            if (Array.isArray(target)) {
              for (j = 0, len = target.length; j < len; j++) {
                insTarget = target[j];
                this.instruction(insTarget);
              }
            } else if (isObject(target)) {
              for (insTarget in target) {
                if (!hasProp.call(target, insTarget)) continue;
                insValue = target[insTarget];
                this.instruction(insTarget, insValue);
              }
            } else {
              if (isFunction(value)) {
                value = value.apply();
              }
              instruction = new XMLProcessingInstruction(this, target, value);
              this.children.push(instruction);
            }
            return this;
          }
          // Creates a processing instruction node before the current node
          // `target` instruction target
          // `value` instruction value
          instructionBefore(target, value) {
            var child, i2, removed;
            i2 = this.parent.children.indexOf(this);
            removed = this.parent.children.splice(i2);
            child = this.parent.instruction(target, value);
            Array.prototype.push.apply(this.parent.children, removed);
            return this;
          }
          // Creates a processing instruction node after the current node
          // `target` instruction target
          // `value` instruction value
          instructionAfter(target, value) {
            var child, i2, removed;
            i2 = this.parent.children.indexOf(this);
            removed = this.parent.children.splice(i2 + 1);
            child = this.parent.instruction(target, value);
            Array.prototype.push.apply(this.parent.children, removed);
            return this;
          }
          // Creates the xml declaration
          // `version` A version number string, e.g. 1.0
          // `encoding` Encoding declaration, e.g. UTF-8
          // `standalone` standalone document declaration: true or false
          declaration(version, encoding, standalone) {
            var doc, xmldec;
            doc = this.document();
            xmldec = new XMLDeclaration(doc, version, encoding, standalone);
            if (doc.children.length === 0) {
              doc.children.unshift(xmldec);
            } else if (doc.children[0].type === NodeType.Declaration) {
              doc.children[0] = xmldec;
            } else {
              doc.children.unshift(xmldec);
            }
            return doc.root() || doc;
          }
          // Creates the document type declaration
          // `pubID` the public identifier of the external subset
          // `sysID` the system identifier of the external subset
          dtd(pubID, sysID) {
            var child, doc, doctype, i2, j, k, len, len1, ref1, ref2;
            doc = this.document();
            doctype = new XMLDocType(doc, pubID, sysID);
            ref1 = doc.children;
            for (i2 = j = 0, len = ref1.length; j < len; i2 = ++j) {
              child = ref1[i2];
              if (child.type === NodeType.DocType) {
                doc.children[i2] = doctype;
                return doctype;
              }
            }
            ref2 = doc.children;
            for (i2 = k = 0, len1 = ref2.length; k < len1; i2 = ++k) {
              child = ref2[i2];
              if (child.isRoot) {
                doc.children.splice(i2, 0, doctype);
                return doctype;
              }
            }
            doc.children.push(doctype);
            return doctype;
          }
          // Gets the parent node
          up() {
            if (this.isRoot) {
              throw new Error("The root node has no parent. Use doc() if you need to get the document object.");
            }
            return this.parent;
          }
          // Gets the root node
          root() {
            var node;
            node = this;
            while (node) {
              if (node.type === NodeType.Document) {
                return node.rootObject;
              } else if (node.isRoot) {
                return node;
              } else {
                node = node.parent;
              }
            }
          }
          // Gets the node representing the XML document
          document() {
            var node;
            node = this;
            while (node) {
              if (node.type === NodeType.Document) {
                return node;
              } else {
                node = node.parent;
              }
            }
          }
          // Ends the document and converts string
          end(options) {
            return this.document().end(options);
          }
          // Gets the previous node
          prev() {
            var i2;
            i2 = this.parent.children.indexOf(this);
            if (i2 < 1) {
              throw new Error("Already at the first node. " + this.debugInfo());
            }
            return this.parent.children[i2 - 1];
          }
          // Gets the next node
          next() {
            var i2;
            i2 = this.parent.children.indexOf(this);
            if (i2 === -1 || i2 === this.parent.children.length - 1) {
              throw new Error("Already at the last node. " + this.debugInfo());
            }
            return this.parent.children[i2 + 1];
          }
          // Imports cloned root from another XML document
          // `doc` the XML document to insert nodes from
          importDocument(doc) {
            var child, clonedRoot, j, len, ref1;
            clonedRoot = doc.root().clone();
            clonedRoot.parent = this;
            clonedRoot.isRoot = false;
            this.children.push(clonedRoot);
            if (this.type === NodeType.Document) {
              clonedRoot.isRoot = true;
              clonedRoot.documentObject = this;
              this.rootObject = clonedRoot;
              if (this.children) {
                ref1 = this.children;
                for (j = 0, len = ref1.length; j < len; j++) {
                  child = ref1[j];
                  if (child.type === NodeType.DocType) {
                    child.name = clonedRoot.name;
                    break;
                  }
                }
              }
            }
            return this;
          }
          // Returns debug string for this node
          debugInfo(name) {
            var ref1, ref2;
            name = name || this.name;
            if (name == null && !((ref1 = this.parent) != null ? ref1.name : void 0)) {
              return "";
            } else if (name == null) {
              return "parent: <" + this.parent.name + ">";
            } else if (!((ref2 = this.parent) != null ? ref2.name : void 0)) {
              return "node: <" + name + ">";
            } else {
              return "node: <" + name + ">, parent: <" + this.parent.name + ">";
            }
          }
          // Aliases
          ele(name, attributes, text) {
            return this.element(name, attributes, text);
          }
          nod(name, attributes, text) {
            return this.node(name, attributes, text);
          }
          txt(value) {
            return this.text(value);
          }
          dat(value) {
            return this.cdata(value);
          }
          com(value) {
            return this.comment(value);
          }
          ins(target, value) {
            return this.instruction(target, value);
          }
          doc() {
            return this.document();
          }
          dec(version, encoding, standalone) {
            return this.declaration(version, encoding, standalone);
          }
          e(name, attributes, text) {
            return this.element(name, attributes, text);
          }
          n(name, attributes, text) {
            return this.node(name, attributes, text);
          }
          t(value) {
            return this.text(value);
          }
          d(value) {
            return this.cdata(value);
          }
          c(value) {
            return this.comment(value);
          }
          r(value) {
            return this.raw(value);
          }
          i(target, value) {
            return this.instruction(target, value);
          }
          u() {
            return this.up();
          }
          // can be deprecated in a future release
          importXMLBuilder(doc) {
            return this.importDocument(doc);
          }
          // Adds or modifies an attribute.
          // `name` attribute name
          // `value` attribute value
          attribute(name, value) {
            throw new Error("attribute() applies to element nodes only.");
          }
          att(name, value) {
            return this.attribute(name, value);
          }
          a(name, value) {
            return this.attribute(name, value);
          }
          // Removes an attribute
          // `name` attribute name
          removeAttribute(name) {
            throw new Error("attribute() applies to element nodes only.");
          }
          // DOM level 1 functions to be implemented later
          replaceChild(newChild, oldChild) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          removeChild(oldChild) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          appendChild(newChild) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          hasChildNodes() {
            return this.children.length !== 0;
          }
          cloneNode(deep) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          normalize() {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          // DOM level 2
          isSupported(feature, version) {
            return true;
          }
          hasAttributes() {
            return this.attribs.length !== 0;
          }
          // DOM level 3 functions to be implemented later
          compareDocumentPosition(other) {
            var ref, res;
            ref = this;
            if (ref === other) {
              return 0;
            } else if (this.document() !== other.document()) {
              res = DocumentPosition.Disconnected | DocumentPosition.ImplementationSpecific;
              if (Math.random() < 0.5) {
                res |= DocumentPosition.Preceding;
              } else {
                res |= DocumentPosition.Following;
              }
              return res;
            } else if (ref.isAncestor(other)) {
              return DocumentPosition.Contains | DocumentPosition.Preceding;
            } else if (ref.isDescendant(other)) {
              return DocumentPosition.Contains | DocumentPosition.Following;
            } else if (ref.isPreceding(other)) {
              return DocumentPosition.Preceding;
            } else {
              return DocumentPosition.Following;
            }
          }
          isSameNode(other) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          lookupPrefix(namespaceURI) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          isDefaultNamespace(namespaceURI) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          lookupNamespaceURI(prefix) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          isEqualNode(node) {
            var i2, j, ref1;
            if (node.nodeType !== this.nodeType) {
              return false;
            }
            if (node.children.length !== this.children.length) {
              return false;
            }
            for (i2 = j = 0, ref1 = this.children.length - 1; 0 <= ref1 ? j <= ref1 : j >= ref1; i2 = 0 <= ref1 ? ++j : --j) {
              if (!this.children[i2].isEqualNode(node.children[i2])) {
                return false;
              }
            }
            return true;
          }
          getFeature(feature, version) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          setUserData(key2, data, handler) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          getUserData(key2) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          // Returns true if other is an inclusive descendant of node,
          // and false otherwise.
          contains(other) {
            if (!other) {
              return false;
            }
            return other === this || this.isDescendant(other);
          }
          // An object A is called a descendant of an object B, if either A is
          // a child of B or A is a child of an object C that is a descendant of B.
          isDescendant(node) {
            var child, isDescendantChild, j, len, ref1;
            ref1 = this.children;
            for (j = 0, len = ref1.length; j < len; j++) {
              child = ref1[j];
              if (node === child) {
                return true;
              }
              isDescendantChild = child.isDescendant(node);
              if (isDescendantChild) {
                return true;
              }
            }
            return false;
          }
          // An object A is called an ancestor of an object B if and only if
          // B is a descendant of A.
          isAncestor(node) {
            return node.isDescendant(this);
          }
          // An object A is preceding an object B if A and B are in the
          // same tree and A comes before B in tree order.
          isPreceding(node) {
            var nodePos, thisPos;
            nodePos = this.treePosition(node);
            thisPos = this.treePosition(this);
            if (nodePos === -1 || thisPos === -1) {
              return false;
            } else {
              return nodePos < thisPos;
            }
          }
          // An object A is folllowing an object B if A and B are in the
          // same tree and A comes after B in tree order.
          isFollowing(node) {
            var nodePos, thisPos;
            nodePos = this.treePosition(node);
            thisPos = this.treePosition(this);
            if (nodePos === -1 || thisPos === -1) {
              return false;
            } else {
              return nodePos > thisPos;
            }
          }
          // Returns the preorder position of the given node in the tree, or -1
          // if the node is not in the tree.
          treePosition(node) {
            var found, pos;
            pos = 0;
            found = false;
            this.foreachTreeNode(this.document(), function(childNode) {
              pos++;
              if (!found && childNode === node) {
                return found = true;
              }
            });
            if (found) {
              return pos;
            } else {
              return -1;
            }
          }
          // Depth-first preorder traversal through the XML tree
          foreachTreeNode(node, func) {
            var child, j, len, ref1, res;
            node || (node = this.document());
            ref1 = node.children;
            for (j = 0, len = ref1.length; j < len; j++) {
              child = ref1[j];
              if (res = func(child)) {
                return res;
              } else {
                res = this.foreachTreeNode(child, func);
                if (res) {
                  return res;
                }
              }
            }
          }
        }
        ;
        Object.defineProperty(XMLNode2.prototype, "nodeName", {
          get: function() {
            return this.name;
          }
        });
        Object.defineProperty(XMLNode2.prototype, "nodeType", {
          get: function() {
            return this.type;
          }
        });
        Object.defineProperty(XMLNode2.prototype, "nodeValue", {
          get: function() {
            return this.value;
          }
        });
        Object.defineProperty(XMLNode2.prototype, "parentNode", {
          get: function() {
            return this.parent;
          }
        });
        Object.defineProperty(XMLNode2.prototype, "childNodes", {
          get: function() {
            if (!this.childNodeList || !this.childNodeList.nodes) {
              this.childNodeList = new XMLNodeList(this.children);
            }
            return this.childNodeList;
          }
        });
        Object.defineProperty(XMLNode2.prototype, "firstChild", {
          get: function() {
            return this.children[0] || null;
          }
        });
        Object.defineProperty(XMLNode2.prototype, "lastChild", {
          get: function() {
            return this.children[this.children.length - 1] || null;
          }
        });
        Object.defineProperty(XMLNode2.prototype, "previousSibling", {
          get: function() {
            var i2;
            i2 = this.parent.children.indexOf(this);
            return this.parent.children[i2 - 1] || null;
          }
        });
        Object.defineProperty(XMLNode2.prototype, "nextSibling", {
          get: function() {
            var i2;
            i2 = this.parent.children.indexOf(this);
            return this.parent.children[i2 + 1] || null;
          }
        });
        Object.defineProperty(XMLNode2.prototype, "ownerDocument", {
          get: function() {
            return this.document() || null;
          }
        });
        Object.defineProperty(XMLNode2.prototype, "textContent", {
          get: function() {
            var child, j, len, ref1, str;
            if (this.nodeType === NodeType.Element || this.nodeType === NodeType.DocumentFragment) {
              str = "";
              ref1 = this.children;
              for (j = 0, len = ref1.length; j < len; j++) {
                child = ref1[j];
                if (child.textContent) {
                  str += child.textContent;
                }
              }
              return str;
            } else {
              return null;
            }
          },
          set: function(value) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
        });
        return XMLNode2;
      }).call(this);
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLStringifier.js
var require_XMLStringifier = __commonJS({
  "node_modules/xmlbuilder/lib/XMLStringifier.js"(exports2, module2) {
    (function() {
      var XMLStringifier, hasProp = {}.hasOwnProperty;
      module2.exports = XMLStringifier = (function() {
        class XMLStringifier2 {
          // Initializes a new instance of `XMLStringifier`
          // `options.version` The version number string of the XML spec to validate against, e.g. 1.0
          // `options.noDoubleEncoding` whether existing html entities are encoded: true or false
          // `options.stringify` a set of functions to use for converting values to strings
          // `options.noValidation` whether values will be validated and escaped or returned as is
          // `options.invalidCharReplacement` a character to replace invalid characters and disable character validation
          constructor(options) {
            var key2, ref, value;
            this.assertLegalChar = this.assertLegalChar.bind(this);
            this.assertLegalName = this.assertLegalName.bind(this);
            options || (options = {});
            this.options = options;
            if (!this.options.version) {
              this.options.version = "1.0";
            }
            ref = options.stringify || {};
            for (key2 in ref) {
              if (!hasProp.call(ref, key2)) continue;
              value = ref[key2];
              this[key2] = value;
            }
          }
          // Defaults
          name(val) {
            if (this.options.noValidation) {
              return val;
            }
            return this.assertLegalName("" + val || "");
          }
          text(val) {
            if (this.options.noValidation) {
              return val;
            }
            return this.assertLegalChar(this.textEscape("" + val || ""));
          }
          cdata(val) {
            if (this.options.noValidation) {
              return val;
            }
            val = "" + val || "";
            val = val.replace("]]>", "]]]]><![CDATA[>");
            return this.assertLegalChar(val);
          }
          comment(val) {
            if (this.options.noValidation) {
              return val;
            }
            val = "" + val || "";
            if (val.match(/--/)) {
              throw new Error("Comment text cannot contain double-hypen: " + val);
            }
            return this.assertLegalChar(val);
          }
          raw(val) {
            if (this.options.noValidation) {
              return val;
            }
            return "" + val || "";
          }
          attValue(val) {
            if (this.options.noValidation) {
              return val;
            }
            return this.assertLegalChar(this.attEscape(val = "" + val || ""));
          }
          insTarget(val) {
            if (this.options.noValidation) {
              return val;
            }
            return this.assertLegalChar("" + val || "");
          }
          insValue(val) {
            if (this.options.noValidation) {
              return val;
            }
            val = "" + val || "";
            if (val.match(/\?>/)) {
              throw new Error("Invalid processing instruction value: " + val);
            }
            return this.assertLegalChar(val);
          }
          xmlVersion(val) {
            if (this.options.noValidation) {
              return val;
            }
            val = "" + val || "";
            if (!val.match(/1\.[0-9]+/)) {
              throw new Error("Invalid version number: " + val);
            }
            return val;
          }
          xmlEncoding(val) {
            if (this.options.noValidation) {
              return val;
            }
            val = "" + val || "";
            if (!val.match(/^[A-Za-z](?:[A-Za-z0-9._-])*$/)) {
              throw new Error("Invalid encoding: " + val);
            }
            return this.assertLegalChar(val);
          }
          xmlStandalone(val) {
            if (this.options.noValidation) {
              return val;
            }
            if (val) {
              return "yes";
            } else {
              return "no";
            }
          }
          dtdPubID(val) {
            if (this.options.noValidation) {
              return val;
            }
            return this.assertLegalChar("" + val || "");
          }
          dtdSysID(val) {
            if (this.options.noValidation) {
              return val;
            }
            return this.assertLegalChar("" + val || "");
          }
          dtdElementValue(val) {
            if (this.options.noValidation) {
              return val;
            }
            return this.assertLegalChar("" + val || "");
          }
          dtdAttType(val) {
            if (this.options.noValidation) {
              return val;
            }
            return this.assertLegalChar("" + val || "");
          }
          dtdAttDefault(val) {
            if (this.options.noValidation) {
              return val;
            }
            return this.assertLegalChar("" + val || "");
          }
          dtdEntityValue(val) {
            if (this.options.noValidation) {
              return val;
            }
            return this.assertLegalChar("" + val || "");
          }
          dtdNData(val) {
            if (this.options.noValidation) {
              return val;
            }
            return this.assertLegalChar("" + val || "");
          }
          assertLegalChar(str) {
            var regex, res;
            if (this.options.noValidation) {
              return str;
            }
            if (this.options.version === "1.0") {
              regex = /[\0-\x08\x0B\f\x0E-\x1F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/g;
              if (this.options.invalidCharReplacement !== void 0) {
                str = str.replace(regex, this.options.invalidCharReplacement);
              } else if (res = str.match(regex)) {
                throw new Error(`Invalid character in string: ${str} at index ${res.index}`);
              }
            } else if (this.options.version === "1.1") {
              regex = /[\0\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/g;
              if (this.options.invalidCharReplacement !== void 0) {
                str = str.replace(regex, this.options.invalidCharReplacement);
              } else if (res = str.match(regex)) {
                throw new Error(`Invalid character in string: ${str} at index ${res.index}`);
              }
            }
            return str;
          }
          assertLegalName(str) {
            var regex;
            if (this.options.noValidation) {
              return str;
            }
            str = this.assertLegalChar(str);
            regex = /^([:A-Z_a-z\xC0-\xD6\xD8-\xF6\xF8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]|[\uD800-\uDB7F][\uDC00-\uDFFF])([\x2D\.0-:A-Z_a-z\xB7\xC0-\xD6\xD8-\xF6\xF8-\u037D\u037F-\u1FFF\u200C\u200D\u203F\u2040\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]|[\uD800-\uDB7F][\uDC00-\uDFFF])*$/;
            if (!str.match(regex)) {
              throw new Error(`Invalid character in name: ${str}`);
            }
            return str;
          }
          // Escapes special characters in text
          // See http://www.w3.org/TR/2000/WD-xml-c14n-20000119.html#charescaping
          // `str` the string to escape
          textEscape(str) {
            var ampregex;
            if (this.options.noValidation) {
              return str;
            }
            ampregex = this.options.noDoubleEncoding ? /(?!&(lt|gt|amp|apos|quot);)&/g : /&/g;
            return str.replace(ampregex, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r/g, "&#xD;");
          }
          // Escapes special characters in attribute values
          // See http://www.w3.org/TR/2000/WD-xml-c14n-20000119.html#charescaping
          // `str` the string to escape
          attEscape(str) {
            var ampregex;
            if (this.options.noValidation) {
              return str;
            }
            ampregex = this.options.noDoubleEncoding ? /(?!&(lt|gt|amp|apos|quot);)&/g : /&/g;
            return str.replace(ampregex, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;").replace(/\t/g, "&#x9;").replace(/\n/g, "&#xA;").replace(/\r/g, "&#xD;");
          }
        }
        ;
        XMLStringifier2.prototype.convertAttKey = "@";
        XMLStringifier2.prototype.convertPIKey = "?";
        XMLStringifier2.prototype.convertTextKey = "#text";
        XMLStringifier2.prototype.convertCDataKey = "#cdata";
        XMLStringifier2.prototype.convertCommentKey = "#comment";
        XMLStringifier2.prototype.convertRawKey = "#raw";
        return XMLStringifier2;
      }).call(this);
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/WriterState.js
var require_WriterState = __commonJS({
  "node_modules/xmlbuilder/lib/WriterState.js"(exports2, module2) {
    (function() {
      module2.exports = {
        None: 0,
        OpenTag: 1,
        InsideTag: 2,
        CloseTag: 3
      };
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLWriterBase.js
var require_XMLWriterBase = __commonJS({
  "node_modules/xmlbuilder/lib/XMLWriterBase.js"(exports2, module2) {
    (function() {
      var NodeType, WriterState, XMLCData, XMLComment, XMLDTDAttList, XMLDTDElement, XMLDTDEntity, XMLDTDNotation, XMLDeclaration, XMLDocType, XMLDummy, XMLElement, XMLProcessingInstruction, XMLRaw, XMLText, XMLWriterBase, assign, hasProp = {}.hasOwnProperty;
      ({ assign } = require_Utility());
      NodeType = require_NodeType();
      XMLDeclaration = require_XMLDeclaration();
      XMLDocType = require_XMLDocType();
      XMLCData = require_XMLCData();
      XMLComment = require_XMLComment();
      XMLElement = require_XMLElement();
      XMLRaw = require_XMLRaw();
      XMLText = require_XMLText();
      XMLProcessingInstruction = require_XMLProcessingInstruction();
      XMLDummy = require_XMLDummy();
      XMLDTDAttList = require_XMLDTDAttList();
      XMLDTDElement = require_XMLDTDElement();
      XMLDTDEntity = require_XMLDTDEntity();
      XMLDTDNotation = require_XMLDTDNotation();
      WriterState = require_WriterState();
      module2.exports = XMLWriterBase = class XMLWriterBase {
        // Initializes a new instance of `XMLWriterBase`
        // `options.pretty` pretty prints the result
        // `options.indent` indentation string
        // `options.newline` newline sequence
        // `options.offset` a fixed number of indentations to add to every line
        // `options.width` maximum column width
        // `options.allowEmpty` do not self close empty element tags
        // 'options.dontPrettyTextNodes' if any text is present in node, don't indent or LF
        // `options.spaceBeforeSlash` add a space before the closing slash of empty elements
        constructor(options) {
          var key2, ref, value;
          options || (options = {});
          this.options = options;
          ref = options.writer || {};
          for (key2 in ref) {
            if (!hasProp.call(ref, key2)) continue;
            value = ref[key2];
            this["_" + key2] = this[key2];
            this[key2] = value;
          }
        }
        // Filters writer options and provides defaults
        // `options` writer options
        filterOptions(options) {
          var filteredOptions, ref, ref1, ref2, ref3, ref4, ref5, ref6, ref7;
          options || (options = {});
          options = assign({}, this.options, options);
          filteredOptions = {
            writer: this
          };
          filteredOptions.pretty = options.pretty || false;
          filteredOptions.allowEmpty = options.allowEmpty || false;
          filteredOptions.indent = (ref = options.indent) != null ? ref : "  ";
          filteredOptions.newline = (ref1 = options.newline) != null ? ref1 : "\n";
          filteredOptions.offset = (ref2 = options.offset) != null ? ref2 : 0;
          filteredOptions.width = (ref3 = options.width) != null ? ref3 : 0;
          filteredOptions.dontPrettyTextNodes = (ref4 = (ref5 = options.dontPrettyTextNodes) != null ? ref5 : options.dontprettytextnodes) != null ? ref4 : 0;
          filteredOptions.spaceBeforeSlash = (ref6 = (ref7 = options.spaceBeforeSlash) != null ? ref7 : options.spacebeforeslash) != null ? ref6 : "";
          if (filteredOptions.spaceBeforeSlash === true) {
            filteredOptions.spaceBeforeSlash = " ";
          }
          filteredOptions.suppressPrettyCount = 0;
          filteredOptions.user = {};
          filteredOptions.state = WriterState.None;
          return filteredOptions;
        }
        // Returns the indentation string for the current level
        // `node` current node
        // `options` writer options
        // `level` current indentation level
        indent(node, options, level) {
          var indentLevel;
          if (!options.pretty || options.suppressPrettyCount) {
            return "";
          } else if (options.pretty) {
            indentLevel = (level || 0) + options.offset + 1;
            if (indentLevel > 0) {
              return new Array(indentLevel).join(options.indent);
            }
          }
          return "";
        }
        // Returns the newline string
        // `node` current node
        // `options` writer options
        // `level` current indentation level
        endline(node, options, level) {
          if (!options.pretty || options.suppressPrettyCount) {
            return "";
          } else {
            return options.newline;
          }
        }
        attribute(att, options, level) {
          var r;
          this.openAttribute(att, options, level);
          if (options.pretty && options.width > 0) {
            r = att.name + '="' + att.value + '"';
          } else {
            r = " " + att.name + '="' + att.value + '"';
          }
          this.closeAttribute(att, options, level);
          return r;
        }
        cdata(node, options, level) {
          var r;
          this.openNode(node, options, level);
          options.state = WriterState.OpenTag;
          r = this.indent(node, options, level) + "<![CDATA[";
          options.state = WriterState.InsideTag;
          r += node.value;
          options.state = WriterState.CloseTag;
          r += "]]>" + this.endline(node, options, level);
          options.state = WriterState.None;
          this.closeNode(node, options, level);
          return r;
        }
        comment(node, options, level) {
          var r;
          this.openNode(node, options, level);
          options.state = WriterState.OpenTag;
          r = this.indent(node, options, level) + "<!-- ";
          options.state = WriterState.InsideTag;
          r += node.value;
          options.state = WriterState.CloseTag;
          r += " -->" + this.endline(node, options, level);
          options.state = WriterState.None;
          this.closeNode(node, options, level);
          return r;
        }
        declaration(node, options, level) {
          var r;
          this.openNode(node, options, level);
          options.state = WriterState.OpenTag;
          r = this.indent(node, options, level) + "<?xml";
          options.state = WriterState.InsideTag;
          r += ' version="' + node.version + '"';
          if (node.encoding != null) {
            r += ' encoding="' + node.encoding + '"';
          }
          if (node.standalone != null) {
            r += ' standalone="' + node.standalone + '"';
          }
          options.state = WriterState.CloseTag;
          r += options.spaceBeforeSlash + "?>";
          r += this.endline(node, options, level);
          options.state = WriterState.None;
          this.closeNode(node, options, level);
          return r;
        }
        docType(node, options, level) {
          var child, i2, len1, r, ref;
          level || (level = 0);
          this.openNode(node, options, level);
          options.state = WriterState.OpenTag;
          r = this.indent(node, options, level);
          r += "<!DOCTYPE " + node.root().name;
          if (node.pubID && node.sysID) {
            r += ' PUBLIC "' + node.pubID + '" "' + node.sysID + '"';
          } else if (node.sysID) {
            r += ' SYSTEM "' + node.sysID + '"';
          }
          if (node.children.length > 0) {
            r += " [";
            r += this.endline(node, options, level);
            options.state = WriterState.InsideTag;
            ref = node.children;
            for (i2 = 0, len1 = ref.length; i2 < len1; i2++) {
              child = ref[i2];
              r += this.writeChildNode(child, options, level + 1);
            }
            options.state = WriterState.CloseTag;
            r += "]";
          }
          options.state = WriterState.CloseTag;
          r += options.spaceBeforeSlash + ">";
          r += this.endline(node, options, level);
          options.state = WriterState.None;
          this.closeNode(node, options, level);
          return r;
        }
        element(node, options, level) {
          var att, attLen, child, childNodeCount, firstChildNode, i2, j, len, len1, len2, name, prettySuppressed, r, ratt, ref, ref1, ref2, ref3, rline;
          level || (level = 0);
          prettySuppressed = false;
          this.openNode(node, options, level);
          options.state = WriterState.OpenTag;
          r = this.indent(node, options, level) + "<" + node.name;
          if (options.pretty && options.width > 0) {
            len = r.length;
            ref = node.attribs;
            for (name in ref) {
              if (!hasProp.call(ref, name)) continue;
              att = ref[name];
              ratt = this.attribute(att, options, level);
              attLen = ratt.length;
              if (len + attLen > options.width) {
                rline = this.indent(node, options, level + 1) + ratt;
                r += this.endline(node, options, level) + rline;
                len = rline.length;
              } else {
                rline = " " + ratt;
                r += rline;
                len += rline.length;
              }
            }
          } else {
            ref1 = node.attribs;
            for (name in ref1) {
              if (!hasProp.call(ref1, name)) continue;
              att = ref1[name];
              r += this.attribute(att, options, level);
            }
          }
          childNodeCount = node.children.length;
          firstChildNode = childNodeCount === 0 ? null : node.children[0];
          if (childNodeCount === 0 || node.children.every(function(e) {
            return (e.type === NodeType.Text || e.type === NodeType.Raw || e.type === NodeType.CData) && e.value === "";
          })) {
            if (options.allowEmpty) {
              r += ">";
              options.state = WriterState.CloseTag;
              r += "</" + node.name + ">" + this.endline(node, options, level);
            } else {
              options.state = WriterState.CloseTag;
              r += options.spaceBeforeSlash + "/>" + this.endline(node, options, level);
            }
          } else if (options.pretty && childNodeCount === 1 && (firstChildNode.type === NodeType.Text || firstChildNode.type === NodeType.Raw || firstChildNode.type === NodeType.CData) && firstChildNode.value != null) {
            r += ">";
            options.state = WriterState.InsideTag;
            options.suppressPrettyCount++;
            prettySuppressed = true;
            r += this.writeChildNode(firstChildNode, options, level + 1);
            options.suppressPrettyCount--;
            prettySuppressed = false;
            options.state = WriterState.CloseTag;
            r += "</" + node.name + ">" + this.endline(node, options, level);
          } else {
            if (options.dontPrettyTextNodes) {
              ref2 = node.children;
              for (i2 = 0, len1 = ref2.length; i2 < len1; i2++) {
                child = ref2[i2];
                if ((child.type === NodeType.Text || child.type === NodeType.Raw || child.type === NodeType.CData) && child.value != null) {
                  options.suppressPrettyCount++;
                  prettySuppressed = true;
                  break;
                }
              }
            }
            r += ">" + this.endline(node, options, level);
            options.state = WriterState.InsideTag;
            ref3 = node.children;
            for (j = 0, len2 = ref3.length; j < len2; j++) {
              child = ref3[j];
              r += this.writeChildNode(child, options, level + 1);
            }
            options.state = WriterState.CloseTag;
            r += this.indent(node, options, level) + "</" + node.name + ">";
            if (prettySuppressed) {
              options.suppressPrettyCount--;
            }
            r += this.endline(node, options, level);
            options.state = WriterState.None;
          }
          this.closeNode(node, options, level);
          return r;
        }
        writeChildNode(node, options, level) {
          switch (node.type) {
            case NodeType.CData:
              return this.cdata(node, options, level);
            case NodeType.Comment:
              return this.comment(node, options, level);
            case NodeType.Element:
              return this.element(node, options, level);
            case NodeType.Raw:
              return this.raw(node, options, level);
            case NodeType.Text:
              return this.text(node, options, level);
            case NodeType.ProcessingInstruction:
              return this.processingInstruction(node, options, level);
            case NodeType.Dummy:
              return "";
            case NodeType.Declaration:
              return this.declaration(node, options, level);
            case NodeType.DocType:
              return this.docType(node, options, level);
            case NodeType.AttributeDeclaration:
              return this.dtdAttList(node, options, level);
            case NodeType.ElementDeclaration:
              return this.dtdElement(node, options, level);
            case NodeType.EntityDeclaration:
              return this.dtdEntity(node, options, level);
            case NodeType.NotationDeclaration:
              return this.dtdNotation(node, options, level);
            default:
              throw new Error("Unknown XML node type: " + node.constructor.name);
          }
        }
        processingInstruction(node, options, level) {
          var r;
          this.openNode(node, options, level);
          options.state = WriterState.OpenTag;
          r = this.indent(node, options, level) + "<?";
          options.state = WriterState.InsideTag;
          r += node.target;
          if (node.value) {
            r += " " + node.value;
          }
          options.state = WriterState.CloseTag;
          r += options.spaceBeforeSlash + "?>";
          r += this.endline(node, options, level);
          options.state = WriterState.None;
          this.closeNode(node, options, level);
          return r;
        }
        raw(node, options, level) {
          var r;
          this.openNode(node, options, level);
          options.state = WriterState.OpenTag;
          r = this.indent(node, options, level);
          options.state = WriterState.InsideTag;
          r += node.value;
          options.state = WriterState.CloseTag;
          r += this.endline(node, options, level);
          options.state = WriterState.None;
          this.closeNode(node, options, level);
          return r;
        }
        text(node, options, level) {
          var r;
          this.openNode(node, options, level);
          options.state = WriterState.OpenTag;
          r = this.indent(node, options, level);
          options.state = WriterState.InsideTag;
          r += node.value;
          options.state = WriterState.CloseTag;
          r += this.endline(node, options, level);
          options.state = WriterState.None;
          this.closeNode(node, options, level);
          return r;
        }
        dtdAttList(node, options, level) {
          var r;
          this.openNode(node, options, level);
          options.state = WriterState.OpenTag;
          r = this.indent(node, options, level) + "<!ATTLIST";
          options.state = WriterState.InsideTag;
          r += " " + node.elementName + " " + node.attributeName + " " + node.attributeType;
          if (node.defaultValueType !== "#DEFAULT") {
            r += " " + node.defaultValueType;
          }
          if (node.defaultValue) {
            r += ' "' + node.defaultValue + '"';
          }
          options.state = WriterState.CloseTag;
          r += options.spaceBeforeSlash + ">" + this.endline(node, options, level);
          options.state = WriterState.None;
          this.closeNode(node, options, level);
          return r;
        }
        dtdElement(node, options, level) {
          var r;
          this.openNode(node, options, level);
          options.state = WriterState.OpenTag;
          r = this.indent(node, options, level) + "<!ELEMENT";
          options.state = WriterState.InsideTag;
          r += " " + node.name + " " + node.value;
          options.state = WriterState.CloseTag;
          r += options.spaceBeforeSlash + ">" + this.endline(node, options, level);
          options.state = WriterState.None;
          this.closeNode(node, options, level);
          return r;
        }
        dtdEntity(node, options, level) {
          var r;
          this.openNode(node, options, level);
          options.state = WriterState.OpenTag;
          r = this.indent(node, options, level) + "<!ENTITY";
          options.state = WriterState.InsideTag;
          if (node.pe) {
            r += " %";
          }
          r += " " + node.name;
          if (node.value) {
            r += ' "' + node.value + '"';
          } else {
            if (node.pubID && node.sysID) {
              r += ' PUBLIC "' + node.pubID + '" "' + node.sysID + '"';
            } else if (node.sysID) {
              r += ' SYSTEM "' + node.sysID + '"';
            }
            if (node.nData) {
              r += " NDATA " + node.nData;
            }
          }
          options.state = WriterState.CloseTag;
          r += options.spaceBeforeSlash + ">" + this.endline(node, options, level);
          options.state = WriterState.None;
          this.closeNode(node, options, level);
          return r;
        }
        dtdNotation(node, options, level) {
          var r;
          this.openNode(node, options, level);
          options.state = WriterState.OpenTag;
          r = this.indent(node, options, level) + "<!NOTATION";
          options.state = WriterState.InsideTag;
          r += " " + node.name;
          if (node.pubID && node.sysID) {
            r += ' PUBLIC "' + node.pubID + '" "' + node.sysID + '"';
          } else if (node.pubID) {
            r += ' PUBLIC "' + node.pubID + '"';
          } else if (node.sysID) {
            r += ' SYSTEM "' + node.sysID + '"';
          }
          options.state = WriterState.CloseTag;
          r += options.spaceBeforeSlash + ">" + this.endline(node, options, level);
          options.state = WriterState.None;
          this.closeNode(node, options, level);
          return r;
        }
        openNode(node, options, level) {
        }
        closeNode(node, options, level) {
        }
        openAttribute(att, options, level) {
        }
        closeAttribute(att, options, level) {
        }
      };
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLStringWriter.js
var require_XMLStringWriter = __commonJS({
  "node_modules/xmlbuilder/lib/XMLStringWriter.js"(exports2, module2) {
    (function() {
      var XMLStringWriter, XMLWriterBase;
      XMLWriterBase = require_XMLWriterBase();
      module2.exports = XMLStringWriter = class XMLStringWriter extends XMLWriterBase {
        // Initializes a new instance of `XMLStringWriter`
        // `options.pretty` pretty prints the result
        // `options.indent` indentation string
        // `options.newline` newline sequence
        // `options.offset` a fixed number of indentations to add to every line
        // `options.allowEmpty` do not self close empty element tags
        // 'options.dontPrettyTextNodes' if any text is present in node, don't indent or LF
        // `options.spaceBeforeSlash` add a space before the closing slash of empty elements
        constructor(options) {
          super(options);
        }
        document(doc, options) {
          var child, i2, len, r, ref;
          options = this.filterOptions(options);
          r = "";
          ref = doc.children;
          for (i2 = 0, len = ref.length; i2 < len; i2++) {
            child = ref[i2];
            r += this.writeChildNode(child, options, 0);
          }
          if (options.pretty && r.slice(-options.newline.length) === options.newline) {
            r = r.slice(0, -options.newline.length);
          }
          return r;
        }
      };
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLDocument.js
var require_XMLDocument = __commonJS({
  "node_modules/xmlbuilder/lib/XMLDocument.js"(exports2, module2) {
    (function() {
      var NodeType, XMLDOMConfiguration, XMLDOMImplementation, XMLDocument, XMLNode, XMLStringWriter, XMLStringifier, isPlainObject;
      ({ isPlainObject } = require_Utility());
      XMLDOMImplementation = require_XMLDOMImplementation();
      XMLDOMConfiguration = require_XMLDOMConfiguration();
      XMLNode = require_XMLNode();
      NodeType = require_NodeType();
      XMLStringifier = require_XMLStringifier();
      XMLStringWriter = require_XMLStringWriter();
      module2.exports = XMLDocument = (function() {
        class XMLDocument2 extends XMLNode {
          // Initializes a new instance of `XMLDocument`
          // `options.keepNullNodes` whether nodes with null values will be kept
          //     or ignored: true or false
          // `options.keepNullAttributes` whether attributes with null values will be
          //     kept or ignored: true or false
          // `options.ignoreDecorators` whether decorator strings will be ignored when
          //     converting JS objects: true or false
          // `options.separateArrayItems` whether array items are created as separate
          //     nodes when passed as an object value: true or false
          // `options.noDoubleEncoding` whether existing html entities are encoded:
          //     true or false
          // `options.stringify` a set of functions to use for converting values to
          //     strings
          // `options.writer` the default XML writer to use for converting nodes to
          //     string. If the default writer is not set, the built-in XMLStringWriter
          //     will be used instead.
          constructor(options) {
            super(null);
            this.name = "#document";
            this.type = NodeType.Document;
            this.documentURI = null;
            this.domConfig = new XMLDOMConfiguration();
            options || (options = {});
            if (!options.writer) {
              options.writer = new XMLStringWriter();
            }
            this.options = options;
            this.stringify = new XMLStringifier(options);
          }
          // Ends the document and passes it to the given XML writer
          // `writer` is either an XML writer or a plain object to pass to the
          // constructor of the default XML writer. The default writer is assigned when
          // creating the XML document. Following flags are recognized by the
          // built-in XMLStringWriter:
          //   `writer.pretty` pretty prints the result
          //   `writer.indent` indentation for pretty print
          //   `writer.offset` how many indentations to add to every line for pretty print
          //   `writer.newline` newline sequence for pretty print
          end(writer) {
            var writerOptions;
            writerOptions = {};
            if (!writer) {
              writer = this.options.writer;
            } else if (isPlainObject(writer)) {
              writerOptions = writer;
              writer = this.options.writer;
            }
            return writer.document(this, writer.filterOptions(writerOptions));
          }
          // Converts the XML document to string
          // `options.pretty` pretty prints the result
          // `options.indent` indentation for pretty print
          // `options.offset` how many indentations to add to every line for pretty print
          // `options.newline` newline sequence for pretty print
          toString(options) {
            return this.options.writer.document(this, this.options.writer.filterOptions(options));
          }
          // DOM level 1 functions to be implemented later
          createElement(tagName) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          createDocumentFragment() {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          createTextNode(data) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          createComment(data) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          createCDATASection(data) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          createProcessingInstruction(target, data) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          createAttribute(name) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          createEntityReference(name) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          getElementsByTagName(tagname) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          // DOM level 2 functions to be implemented later
          importNode(importedNode, deep) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          createElementNS(namespaceURI, qualifiedName) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          createAttributeNS(namespaceURI, qualifiedName) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          getElementsByTagNameNS(namespaceURI, localName) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          getElementById(elementId) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          // DOM level 3 functions to be implemented later
          adoptNode(source) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          normalizeDocument() {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          renameNode(node, namespaceURI, qualifiedName) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          // DOM level 4 functions to be implemented later
          getElementsByClassName(classNames) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          createEvent(eventInterface) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          createRange() {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          createNodeIterator(root, whatToShow, filter) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
          createTreeWalker(root, whatToShow, filter) {
            throw new Error("This DOM method is not implemented." + this.debugInfo());
          }
        }
        ;
        Object.defineProperty(XMLDocument2.prototype, "implementation", {
          value: new XMLDOMImplementation()
        });
        Object.defineProperty(XMLDocument2.prototype, "doctype", {
          get: function() {
            var child, i2, len, ref;
            ref = this.children;
            for (i2 = 0, len = ref.length; i2 < len; i2++) {
              child = ref[i2];
              if (child.type === NodeType.DocType) {
                return child;
              }
            }
            return null;
          }
        });
        Object.defineProperty(XMLDocument2.prototype, "documentElement", {
          get: function() {
            return this.rootObject || null;
          }
        });
        Object.defineProperty(XMLDocument2.prototype, "inputEncoding", {
          get: function() {
            return null;
          }
        });
        Object.defineProperty(XMLDocument2.prototype, "strictErrorChecking", {
          get: function() {
            return false;
          }
        });
        Object.defineProperty(XMLDocument2.prototype, "xmlEncoding", {
          get: function() {
            if (this.children.length !== 0 && this.children[0].type === NodeType.Declaration) {
              return this.children[0].encoding;
            } else {
              return null;
            }
          }
        });
        Object.defineProperty(XMLDocument2.prototype, "xmlStandalone", {
          get: function() {
            if (this.children.length !== 0 && this.children[0].type === NodeType.Declaration) {
              return this.children[0].standalone === "yes";
            } else {
              return false;
            }
          }
        });
        Object.defineProperty(XMLDocument2.prototype, "xmlVersion", {
          get: function() {
            if (this.children.length !== 0 && this.children[0].type === NodeType.Declaration) {
              return this.children[0].version;
            } else {
              return "1.0";
            }
          }
        });
        Object.defineProperty(XMLDocument2.prototype, "URL", {
          get: function() {
            return this.documentURI;
          }
        });
        Object.defineProperty(XMLDocument2.prototype, "origin", {
          get: function() {
            return null;
          }
        });
        Object.defineProperty(XMLDocument2.prototype, "compatMode", {
          get: function() {
            return null;
          }
        });
        Object.defineProperty(XMLDocument2.prototype, "characterSet", {
          get: function() {
            return null;
          }
        });
        Object.defineProperty(XMLDocument2.prototype, "contentType", {
          get: function() {
            return null;
          }
        });
        return XMLDocument2;
      }).call(this);
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLDocumentCB.js
var require_XMLDocumentCB = __commonJS({
  "node_modules/xmlbuilder/lib/XMLDocumentCB.js"(exports2, module2) {
    (function() {
      var NodeType, WriterState, XMLAttribute, XMLCData, XMLComment, XMLDTDAttList, XMLDTDElement, XMLDTDEntity, XMLDTDNotation, XMLDeclaration, XMLDocType, XMLDocument, XMLDocumentCB, XMLElement, XMLProcessingInstruction, XMLRaw, XMLStringWriter, XMLStringifier, XMLText, getValue, isFunction, isObject, isPlainObject, hasProp = {}.hasOwnProperty;
      ({ isObject, isFunction, isPlainObject, getValue } = require_Utility());
      NodeType = require_NodeType();
      XMLDocument = require_XMLDocument();
      XMLElement = require_XMLElement();
      XMLCData = require_XMLCData();
      XMLComment = require_XMLComment();
      XMLRaw = require_XMLRaw();
      XMLText = require_XMLText();
      XMLProcessingInstruction = require_XMLProcessingInstruction();
      XMLDeclaration = require_XMLDeclaration();
      XMLDocType = require_XMLDocType();
      XMLDTDAttList = require_XMLDTDAttList();
      XMLDTDEntity = require_XMLDTDEntity();
      XMLDTDElement = require_XMLDTDElement();
      XMLDTDNotation = require_XMLDTDNotation();
      XMLAttribute = require_XMLAttribute();
      XMLStringifier = require_XMLStringifier();
      XMLStringWriter = require_XMLStringWriter();
      WriterState = require_WriterState();
      module2.exports = XMLDocumentCB = class XMLDocumentCB {
        // Initializes a new instance of `XMLDocumentCB`
        // `options.keepNullNodes` whether nodes with null values will be kept
        //     or ignored: true or false
        // `options.keepNullAttributes` whether attributes with null values will be
        //     kept or ignored: true or false
        // `options.ignoreDecorators` whether decorator strings will be ignored when
        //     converting JS objects: true or false
        // `options.separateArrayItems` whether array items are created as separate
        //     nodes when passed as an object value: true or false
        // `options.noDoubleEncoding` whether existing html entities are encoded:
        //     true or false
        // `options.stringify` a set of functions to use for converting values to
        //     strings
        // `options.writer` the default XML writer to use for converting nodes to
        //     string. If the default writer is not set, the built-in XMLStringWriter
        //     will be used instead.
        // `onData` the function to be called when a new chunk of XML is output. The
        //          string containing the XML chunk is passed to `onData` as its first
        //          argument, and the current indentation level as its second argument.
        // `onEnd`  the function to be called when the XML document is completed with
        //          `end`. `onEnd` does not receive any arguments.
        constructor(options, onData, onEnd) {
          var writerOptions;
          this.name = "?xml";
          this.type = NodeType.Document;
          options || (options = {});
          writerOptions = {};
          if (!options.writer) {
            options.writer = new XMLStringWriter();
          } else if (isPlainObject(options.writer)) {
            writerOptions = options.writer;
            options.writer = new XMLStringWriter();
          }
          this.options = options;
          this.writer = options.writer;
          this.writerOptions = this.writer.filterOptions(writerOptions);
          this.stringify = new XMLStringifier(options);
          this.onDataCallback = onData || function() {
          };
          this.onEndCallback = onEnd || function() {
          };
          this.currentNode = null;
          this.currentLevel = -1;
          this.openTags = {};
          this.documentStarted = false;
          this.documentCompleted = false;
          this.root = null;
        }
        // Creates a child element node from the given XMLNode
        // `node` the child node
        createChildNode(node) {
          var att, attName, attributes, child, i2, len, ref, ref1;
          switch (node.type) {
            case NodeType.CData:
              this.cdata(node.value);
              break;
            case NodeType.Comment:
              this.comment(node.value);
              break;
            case NodeType.Element:
              attributes = {};
              ref = node.attribs;
              for (attName in ref) {
                if (!hasProp.call(ref, attName)) continue;
                att = ref[attName];
                attributes[attName] = att.value;
              }
              this.node(node.name, attributes);
              break;
            case NodeType.Dummy:
              this.dummy();
              break;
            case NodeType.Raw:
              this.raw(node.value);
              break;
            case NodeType.Text:
              this.text(node.value);
              break;
            case NodeType.ProcessingInstruction:
              this.instruction(node.target, node.value);
              break;
            default:
              throw new Error("This XML node type is not supported in a JS object: " + node.constructor.name);
          }
          ref1 = node.children;
          for (i2 = 0, len = ref1.length; i2 < len; i2++) {
            child = ref1[i2];
            this.createChildNode(child);
            if (child.type === NodeType.Element) {
              this.up();
            }
          }
          return this;
        }
        // Creates a dummy node
        dummy() {
          return this;
        }
        // Creates a node
        // `name` name of the node
        // `attributes` an object containing name/value pairs of attributes
        // `text` element text
        node(name, attributes, text) {
          if (name == null) {
            throw new Error("Missing node name.");
          }
          if (this.root && this.currentLevel === -1) {
            throw new Error("Document can only have one root node. " + this.debugInfo(name));
          }
          this.openCurrent();
          name = getValue(name);
          if (attributes == null) {
            attributes = {};
          }
          attributes = getValue(attributes);
          if (!isObject(attributes)) {
            [text, attributes] = [attributes, text];
          }
          this.currentNode = new XMLElement(this, name, attributes);
          this.currentNode.children = false;
          this.currentLevel++;
          this.openTags[this.currentLevel] = this.currentNode;
          if (text != null) {
            this.text(text);
          }
          return this;
        }
        // Creates a child element node or an element type declaration when called
        // inside the DTD
        // `name` name of the node
        // `attributes` an object containing name/value pairs of attributes
        // `text` element text
        element(name, attributes, text) {
          var child, i2, len, oldValidationFlag, ref, root;
          if (this.currentNode && this.currentNode.type === NodeType.DocType) {
            this.dtdElement(...arguments);
          } else {
            if (Array.isArray(name) || isObject(name) || isFunction(name)) {
              oldValidationFlag = this.options.noValidation;
              this.options.noValidation = true;
              root = new XMLDocument(this.options).element("TEMP_ROOT");
              root.element(name);
              this.options.noValidation = oldValidationFlag;
              ref = root.children;
              for (i2 = 0, len = ref.length; i2 < len; i2++) {
                child = ref[i2];
                this.createChildNode(child);
                if (child.type === NodeType.Element) {
                  this.up();
                }
              }
            } else {
              this.node(name, attributes, text);
            }
          }
          return this;
        }
        // Adds or modifies an attribute
        // `name` attribute name
        // `value` attribute value
        attribute(name, value) {
          var attName, attValue;
          if (!this.currentNode || this.currentNode.children) {
            throw new Error("att() can only be used immediately after an ele() call in callback mode. " + this.debugInfo(name));
          }
          if (name != null) {
            name = getValue(name);
          }
          if (isObject(name)) {
            for (attName in name) {
              if (!hasProp.call(name, attName)) continue;
              attValue = name[attName];
              this.attribute(attName, attValue);
            }
          } else {
            if (isFunction(value)) {
              value = value.apply();
            }
            if (this.options.keepNullAttributes && value == null) {
              this.currentNode.attribs[name] = new XMLAttribute(this, name, "");
            } else if (value != null) {
              this.currentNode.attribs[name] = new XMLAttribute(this, name, value);
            }
          }
          return this;
        }
        // Creates a text node
        // `value` element text
        text(value) {
          var node;
          this.openCurrent();
          node = new XMLText(this, value);
          this.onData(this.writer.text(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
          return this;
        }
        // Creates a CDATA node
        // `value` element text without CDATA delimiters
        cdata(value) {
          var node;
          this.openCurrent();
          node = new XMLCData(this, value);
          this.onData(this.writer.cdata(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
          return this;
        }
        // Creates a comment node
        // `value` comment text
        comment(value) {
          var node;
          this.openCurrent();
          node = new XMLComment(this, value);
          this.onData(this.writer.comment(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
          return this;
        }
        // Adds unescaped raw text
        // `value` text
        raw(value) {
          var node;
          this.openCurrent();
          node = new XMLRaw(this, value);
          this.onData(this.writer.raw(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
          return this;
        }
        // Adds a processing instruction
        // `target` instruction target
        // `value` instruction value
        instruction(target, value) {
          var i2, insTarget, insValue, len, node;
          this.openCurrent();
          if (target != null) {
            target = getValue(target);
          }
          if (value != null) {
            value = getValue(value);
          }
          if (Array.isArray(target)) {
            for (i2 = 0, len = target.length; i2 < len; i2++) {
              insTarget = target[i2];
              this.instruction(insTarget);
            }
          } else if (isObject(target)) {
            for (insTarget in target) {
              if (!hasProp.call(target, insTarget)) continue;
              insValue = target[insTarget];
              this.instruction(insTarget, insValue);
            }
          } else {
            if (isFunction(value)) {
              value = value.apply();
            }
            node = new XMLProcessingInstruction(this, target, value);
            this.onData(this.writer.processingInstruction(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
          }
          return this;
        }
        // Creates the xml declaration
        // `version` A version number string, e.g. 1.0
        // `encoding` Encoding declaration, e.g. UTF-8
        // `standalone` standalone document declaration: true or false
        declaration(version, encoding, standalone) {
          var node;
          this.openCurrent();
          if (this.documentStarted) {
            throw new Error("declaration() must be the first node.");
          }
          node = new XMLDeclaration(this, version, encoding, standalone);
          this.onData(this.writer.declaration(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
          return this;
        }
        // Creates the document type declaration
        // `root`  the name of the root node
        // `pubID` the public identifier of the external subset
        // `sysID` the system identifier of the external subset
        doctype(root, pubID, sysID) {
          this.openCurrent();
          if (root == null) {
            throw new Error("Missing root node name.");
          }
          if (this.root) {
            throw new Error("dtd() must come before the root node.");
          }
          this.currentNode = new XMLDocType(this, pubID, sysID);
          this.currentNode.rootNodeName = root;
          this.currentNode.children = false;
          this.currentLevel++;
          this.openTags[this.currentLevel] = this.currentNode;
          return this;
        }
        // Creates an element type declaration
        // `name` element name
        // `value` element content (defaults to #PCDATA)
        dtdElement(name, value) {
          var node;
          this.openCurrent();
          node = new XMLDTDElement(this, name, value);
          this.onData(this.writer.dtdElement(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
          return this;
        }
        // Creates an attribute declaration
        // `elementName` the name of the element containing this attribute
        // `attributeName` attribute name
        // `attributeType` type of the attribute (defaults to CDATA)
        // `defaultValueType` default value type (either #REQUIRED, #IMPLIED, #FIXED or
        //                    #DEFAULT) (defaults to #IMPLIED)
        // `defaultValue` default value of the attribute
        //                (only used for #FIXED or #DEFAULT)
        attList(elementName, attributeName, attributeType, defaultValueType, defaultValue) {
          var node;
          this.openCurrent();
          node = new XMLDTDAttList(this, elementName, attributeName, attributeType, defaultValueType, defaultValue);
          this.onData(this.writer.dtdAttList(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
          return this;
        }
        // Creates a general entity declaration
        // `name` the name of the entity
        // `value` internal entity value or an object with external entity details
        // `value.pubID` public identifier
        // `value.sysID` system identifier
        // `value.nData` notation declaration
        entity(name, value) {
          var node;
          this.openCurrent();
          node = new XMLDTDEntity(this, false, name, value);
          this.onData(this.writer.dtdEntity(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
          return this;
        }
        // Creates a parameter entity declaration
        // `name` the name of the entity
        // `value` internal entity value or an object with external entity details
        // `value.pubID` public identifier
        // `value.sysID` system identifier
        pEntity(name, value) {
          var node;
          this.openCurrent();
          node = new XMLDTDEntity(this, true, name, value);
          this.onData(this.writer.dtdEntity(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
          return this;
        }
        // Creates a NOTATION declaration
        // `name` the name of the notation
        // `value` an object with external entity details
        // `value.pubID` public identifier
        // `value.sysID` system identifier
        notation(name, value) {
          var node;
          this.openCurrent();
          node = new XMLDTDNotation(this, name, value);
          this.onData(this.writer.dtdNotation(node, this.writerOptions, this.currentLevel + 1), this.currentLevel + 1);
          return this;
        }
        // Gets the parent node
        up() {
          if (this.currentLevel < 0) {
            throw new Error("The document node has no parent.");
          }
          if (this.currentNode) {
            if (this.currentNode.children) {
              this.closeNode(this.currentNode);
            } else {
              this.openNode(this.currentNode);
            }
            this.currentNode = null;
          } else {
            this.closeNode(this.openTags[this.currentLevel]);
          }
          delete this.openTags[this.currentLevel];
          this.currentLevel--;
          return this;
        }
        // Ends the document
        end() {
          while (this.currentLevel >= 0) {
            this.up();
          }
          return this.onEnd();
        }
        // Opens the current parent node
        openCurrent() {
          if (this.currentNode) {
            this.currentNode.children = true;
            return this.openNode(this.currentNode);
          }
        }
        // Writes the opening tag of the current node or the entire node if it has
        // no child nodes
        openNode(node) {
          var att, chunk, name, ref;
          if (!node.isOpen) {
            if (!this.root && this.currentLevel === 0 && node.type === NodeType.Element) {
              this.root = node;
            }
            chunk = "";
            if (node.type === NodeType.Element) {
              this.writerOptions.state = WriterState.OpenTag;
              chunk = this.writer.indent(node, this.writerOptions, this.currentLevel) + "<" + node.name;
              ref = node.attribs;
              for (name in ref) {
                if (!hasProp.call(ref, name)) continue;
                att = ref[name];
                chunk += this.writer.attribute(att, this.writerOptions, this.currentLevel);
              }
              chunk += (node.children ? ">" : "/>") + this.writer.endline(node, this.writerOptions, this.currentLevel);
              this.writerOptions.state = WriterState.InsideTag;
            } else {
              this.writerOptions.state = WriterState.OpenTag;
              chunk = this.writer.indent(node, this.writerOptions, this.currentLevel) + "<!DOCTYPE " + node.rootNodeName;
              if (node.pubID && node.sysID) {
                chunk += ' PUBLIC "' + node.pubID + '" "' + node.sysID + '"';
              } else if (node.sysID) {
                chunk += ' SYSTEM "' + node.sysID + '"';
              }
              if (node.children) {
                chunk += " [";
                this.writerOptions.state = WriterState.InsideTag;
              } else {
                this.writerOptions.state = WriterState.CloseTag;
                chunk += ">";
              }
              chunk += this.writer.endline(node, this.writerOptions, this.currentLevel);
            }
            this.onData(chunk, this.currentLevel);
            return node.isOpen = true;
          }
        }
        // Writes the closing tag of the current node
        closeNode(node) {
          var chunk;
          if (!node.isClosed) {
            chunk = "";
            this.writerOptions.state = WriterState.CloseTag;
            if (node.type === NodeType.Element) {
              chunk = this.writer.indent(node, this.writerOptions, this.currentLevel) + "</" + node.name + ">" + this.writer.endline(node, this.writerOptions, this.currentLevel);
            } else {
              chunk = this.writer.indent(node, this.writerOptions, this.currentLevel) + "]>" + this.writer.endline(node, this.writerOptions, this.currentLevel);
            }
            this.writerOptions.state = WriterState.None;
            this.onData(chunk, this.currentLevel);
            return node.isClosed = true;
          }
        }
        // Called when a new chunk of XML is output
        // `chunk` a string containing the XML chunk
        // `level` current indentation level
        onData(chunk, level) {
          this.documentStarted = true;
          return this.onDataCallback(chunk, level + 1);
        }
        // Called when the XML document is completed
        onEnd() {
          this.documentCompleted = true;
          return this.onEndCallback();
        }
        // Returns debug string
        debugInfo(name) {
          if (name == null) {
            return "";
          } else {
            return "node: <" + name + ">";
          }
        }
        // Node aliases
        ele() {
          return this.element(...arguments);
        }
        nod(name, attributes, text) {
          return this.node(name, attributes, text);
        }
        txt(value) {
          return this.text(value);
        }
        dat(value) {
          return this.cdata(value);
        }
        com(value) {
          return this.comment(value);
        }
        ins(target, value) {
          return this.instruction(target, value);
        }
        dec(version, encoding, standalone) {
          return this.declaration(version, encoding, standalone);
        }
        dtd(root, pubID, sysID) {
          return this.doctype(root, pubID, sysID);
        }
        e(name, attributes, text) {
          return this.element(name, attributes, text);
        }
        n(name, attributes, text) {
          return this.node(name, attributes, text);
        }
        t(value) {
          return this.text(value);
        }
        d(value) {
          return this.cdata(value);
        }
        c(value) {
          return this.comment(value);
        }
        r(value) {
          return this.raw(value);
        }
        i(target, value) {
          return this.instruction(target, value);
        }
        // Attribute aliases
        att() {
          if (this.currentNode && this.currentNode.type === NodeType.DocType) {
            return this.attList(...arguments);
          } else {
            return this.attribute(...arguments);
          }
        }
        a() {
          if (this.currentNode && this.currentNode.type === NodeType.DocType) {
            return this.attList(...arguments);
          } else {
            return this.attribute(...arguments);
          }
        }
        // DTD aliases
        // att() and ele() are defined above
        ent(name, value) {
          return this.entity(name, value);
        }
        pent(name, value) {
          return this.pEntity(name, value);
        }
        not(name, value) {
          return this.notation(name, value);
        }
      };
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/XMLStreamWriter.js
var require_XMLStreamWriter = __commonJS({
  "node_modules/xmlbuilder/lib/XMLStreamWriter.js"(exports2, module2) {
    (function() {
      var NodeType, WriterState, XMLStreamWriter, XMLWriterBase, hasProp = {}.hasOwnProperty;
      NodeType = require_NodeType();
      XMLWriterBase = require_XMLWriterBase();
      WriterState = require_WriterState();
      module2.exports = XMLStreamWriter = class XMLStreamWriter extends XMLWriterBase {
        // Initializes a new instance of `XMLStreamWriter`
        // `stream` output stream
        // `options.pretty` pretty prints the result
        // `options.indent` indentation string
        // `options.newline` newline sequence
        // `options.offset` a fixed number of indentations to add to every line
        // `options.allowEmpty` do not self close empty element tags
        // 'options.dontPrettyTextNodes' if any text is present in node, don't indent or LF
        // `options.spaceBeforeSlash` add a space before the closing slash of empty elements
        constructor(stream, options) {
          super(options);
          this.stream = stream;
        }
        endline(node, options, level) {
          if (node.isLastRootNode && options.state === WriterState.CloseTag) {
            return "";
          } else {
            return super.endline(node, options, level);
          }
        }
        document(doc, options) {
          var child, i2, j, k, len1, len2, ref, ref1, results;
          ref = doc.children;
          for (i2 = j = 0, len1 = ref.length; j < len1; i2 = ++j) {
            child = ref[i2];
            child.isLastRootNode = i2 === doc.children.length - 1;
          }
          options = this.filterOptions(options);
          ref1 = doc.children;
          results = [];
          for (k = 0, len2 = ref1.length; k < len2; k++) {
            child = ref1[k];
            results.push(this.writeChildNode(child, options, 0));
          }
          return results;
        }
        cdata(node, options, level) {
          return this.stream.write(super.cdata(node, options, level));
        }
        comment(node, options, level) {
          return this.stream.write(super.comment(node, options, level));
        }
        declaration(node, options, level) {
          return this.stream.write(super.declaration(node, options, level));
        }
        docType(node, options, level) {
          var child, j, len1, ref;
          level || (level = 0);
          this.openNode(node, options, level);
          options.state = WriterState.OpenTag;
          this.stream.write(this.indent(node, options, level));
          this.stream.write("<!DOCTYPE " + node.root().name);
          if (node.pubID && node.sysID) {
            this.stream.write(' PUBLIC "' + node.pubID + '" "' + node.sysID + '"');
          } else if (node.sysID) {
            this.stream.write(' SYSTEM "' + node.sysID + '"');
          }
          if (node.children.length > 0) {
            this.stream.write(" [");
            this.stream.write(this.endline(node, options, level));
            options.state = WriterState.InsideTag;
            ref = node.children;
            for (j = 0, len1 = ref.length; j < len1; j++) {
              child = ref[j];
              this.writeChildNode(child, options, level + 1);
            }
            options.state = WriterState.CloseTag;
            this.stream.write("]");
          }
          options.state = WriterState.CloseTag;
          this.stream.write(options.spaceBeforeSlash + ">");
          this.stream.write(this.endline(node, options, level));
          options.state = WriterState.None;
          return this.closeNode(node, options, level);
        }
        element(node, options, level) {
          var att, attLen, child, childNodeCount, firstChildNode, j, len, len1, name, prettySuppressed, r, ratt, ref, ref1, ref2, rline;
          level || (level = 0);
          this.openNode(node, options, level);
          options.state = WriterState.OpenTag;
          r = this.indent(node, options, level) + "<" + node.name;
          if (options.pretty && options.width > 0) {
            len = r.length;
            ref = node.attribs;
            for (name in ref) {
              if (!hasProp.call(ref, name)) continue;
              att = ref[name];
              ratt = this.attribute(att, options, level);
              attLen = ratt.length;
              if (len + attLen > options.width) {
                rline = this.indent(node, options, level + 1) + ratt;
                r += this.endline(node, options, level) + rline;
                len = rline.length;
              } else {
                rline = " " + ratt;
                r += rline;
                len += rline.length;
              }
            }
          } else {
            ref1 = node.attribs;
            for (name in ref1) {
              if (!hasProp.call(ref1, name)) continue;
              att = ref1[name];
              r += this.attribute(att, options, level);
            }
          }
          this.stream.write(r);
          childNodeCount = node.children.length;
          firstChildNode = childNodeCount === 0 ? null : node.children[0];
          if (childNodeCount === 0 || node.children.every(function(e) {
            return (e.type === NodeType.Text || e.type === NodeType.Raw || e.type === NodeType.CData) && e.value === "";
          })) {
            if (options.allowEmpty) {
              this.stream.write(">");
              options.state = WriterState.CloseTag;
              this.stream.write("</" + node.name + ">");
            } else {
              options.state = WriterState.CloseTag;
              this.stream.write(options.spaceBeforeSlash + "/>");
            }
          } else if (options.pretty && childNodeCount === 1 && (firstChildNode.type === NodeType.Text || firstChildNode.type === NodeType.Raw || firstChildNode.type === NodeType.CData) && firstChildNode.value != null) {
            this.stream.write(">");
            options.state = WriterState.InsideTag;
            options.suppressPrettyCount++;
            prettySuppressed = true;
            this.writeChildNode(firstChildNode, options, level + 1);
            options.suppressPrettyCount--;
            prettySuppressed = false;
            options.state = WriterState.CloseTag;
            this.stream.write("</" + node.name + ">");
          } else {
            this.stream.write(">" + this.endline(node, options, level));
            options.state = WriterState.InsideTag;
            ref2 = node.children;
            for (j = 0, len1 = ref2.length; j < len1; j++) {
              child = ref2[j];
              this.writeChildNode(child, options, level + 1);
            }
            options.state = WriterState.CloseTag;
            this.stream.write(this.indent(node, options, level) + "</" + node.name + ">");
          }
          this.stream.write(this.endline(node, options, level));
          options.state = WriterState.None;
          return this.closeNode(node, options, level);
        }
        processingInstruction(node, options, level) {
          return this.stream.write(super.processingInstruction(node, options, level));
        }
        raw(node, options, level) {
          return this.stream.write(super.raw(node, options, level));
        }
        text(node, options, level) {
          return this.stream.write(super.text(node, options, level));
        }
        dtdAttList(node, options, level) {
          return this.stream.write(super.dtdAttList(node, options, level));
        }
        dtdElement(node, options, level) {
          return this.stream.write(super.dtdElement(node, options, level));
        }
        dtdEntity(node, options, level) {
          return this.stream.write(super.dtdEntity(node, options, level));
        }
        dtdNotation(node, options, level) {
          return this.stream.write(super.dtdNotation(node, options, level));
        }
      };
    }).call(exports2);
  }
});

// node_modules/xmlbuilder/lib/index.js
var require_lib2 = __commonJS({
  "node_modules/xmlbuilder/lib/index.js"(exports2, module2) {
    (function() {
      var NodeType, WriterState, XMLDOMImplementation, XMLDocument, XMLDocumentCB, XMLStreamWriter, XMLStringWriter, assign, isFunction;
      ({ assign, isFunction } = require_Utility());
      XMLDOMImplementation = require_XMLDOMImplementation();
      XMLDocument = require_XMLDocument();
      XMLDocumentCB = require_XMLDocumentCB();
      XMLStringWriter = require_XMLStringWriter();
      XMLStreamWriter = require_XMLStreamWriter();
      NodeType = require_NodeType();
      WriterState = require_WriterState();
      module2.exports.create = function(name, xmldec, doctype, options) {
        var doc, root;
        if (name == null) {
          throw new Error("Root element needs a name.");
        }
        options = assign({}, xmldec, doctype, options);
        doc = new XMLDocument(options);
        root = doc.element(name);
        if (!options.headless) {
          doc.declaration(options);
          if (options.pubID != null || options.sysID != null) {
            doc.dtd(options);
          }
        }
        return root;
      };
      module2.exports.begin = function(options, onData, onEnd) {
        if (isFunction(options)) {
          [onData, onEnd] = [options, onData];
          options = {};
        }
        if (onData) {
          return new XMLDocumentCB(options, onData, onEnd);
        } else {
          return new XMLDocument(options);
        }
      };
      module2.exports.stringWriter = function(options) {
        return new XMLStringWriter(options);
      };
      module2.exports.streamWriter = function(stream, options) {
        return new XMLStreamWriter(stream, options);
      };
      module2.exports.implementation = new XMLDOMImplementation();
      module2.exports.nodeType = NodeType;
      module2.exports.writerState = WriterState;
    }).call(exports2);
  }
});

// node_modules/plist/lib/build.js
var require_build = __commonJS({
  "node_modules/plist/lib/build.js"(exports2) {
    var base64 = require_base64_js();
    var xmlbuilder = require_lib2();
    exports2.build = build;
    function ISODateString(d) {
      function pad(n) {
        return n < 10 ? "0" + n : n;
      }
      return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()) + "T" + pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()) + ":" + pad(d.getUTCSeconds()) + "Z";
    }
    var toString = Object.prototype.toString;
    function type(obj) {
      var m = toString.call(obj).match(/\[object (.*)\]/);
      return m ? m[1] : m;
    }
    function build(obj, opts) {
      var XMLHDR = {
        version: "1.0",
        encoding: "UTF-8"
      };
      var XMLDTD = {
        pubid: "-//Apple//DTD PLIST 1.0//EN",
        sysid: "http://www.apple.com/DTDs/PropertyList-1.0.dtd"
      };
      var doc = xmlbuilder.create("plist");
      doc.dec(XMLHDR.version, XMLHDR.encoding, XMLHDR.standalone);
      doc.dtd(XMLDTD.pubid, XMLDTD.sysid);
      doc.att("version", "1.0");
      walk_obj(obj, doc);
      if (!opts) opts = {};
      opts.pretty = opts.pretty !== false;
      return doc.end(opts);
    }
    function walk_obj(next, next_child) {
      var tag_type, i2, prop;
      var name = type(next);
      if ("Undefined" == name) {
        return;
      } else if (Array.isArray(next)) {
        next_child = next_child.ele("array");
        for (i2 = 0; i2 < next.length; i2++) {
          walk_obj(next[i2], next_child);
        }
      } else if (Buffer.isBuffer(next)) {
        next_child.ele("data").raw(next.toString("base64"));
      } else if ("Object" == name) {
        next_child = next_child.ele("dict");
        for (prop in next) {
          if (next.hasOwnProperty(prop)) {
            next_child.ele("key").txt(prop);
            walk_obj(next[prop], next_child);
          }
        }
      } else if ("Number" == name) {
        tag_type = next % 1 === 0 ? "integer" : "real";
        next_child.ele(tag_type).txt(next.toString());
      } else if ("BigInt" == name) {
        next_child.ele("integer").txt(next);
      } else if ("Date" == name) {
        next_child.ele("date").txt(ISODateString(new Date(next)));
      } else if ("Boolean" == name) {
        next_child.ele(next ? "true" : "false");
      } else if ("String" == name) {
        next_child.ele("string").txt(next);
      } else if ("ArrayBuffer" == name) {
        next_child.ele("data").raw(base64.fromByteArray(next));
      } else if (next && next.buffer && "ArrayBuffer" == type(next.buffer)) {
        next_child.ele("data").raw(base64.fromByteArray(new Uint8Array(next.buffer), next_child));
      } else if ("Null" === name) {
        next_child.ele("null").txt("");
      }
    }
  }
});

// node_modules/plist/index.js
var require_plist = __commonJS({
  "node_modules/plist/index.js"(exports2) {
    var parserFunctions = require_parse();
    Object.keys(parserFunctions).forEach(function(k) {
      exports2[k] = parserFunctions[k];
    });
    var builderFunctions = require_build();
    Object.keys(builderFunctions).forEach(function(k) {
      exports2[k] = builderFunctions[k];
    });
  }
});

// node_modules/simple-plist/dist/parse.js
var require_parse2 = __commonJS({
  "node_modules/simple-plist/dist/parse.js"(exports2, module2) {
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    (function(factory) {
      if (typeof module2 === "object" && typeof module2.exports === "object") {
        var v = factory(require, exports2);
        if (v !== void 0) module2.exports = v;
      } else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "bplist-parser", "plist"], factory);
      }
    })(function(_umdRequire, exports3) {
      "use strict";
      Object.defineProperty(exports3, "__esModule", { value: true });
      exports3.parse = void 0;
      var bplist_parser_1 = __importDefault(require_bplistParser());
      var plist_1 = __importDefault(require_plist());
      function parse(aStringOrBuffer, aFile) {
        var firstByte = aStringOrBuffer[0];
        var results;
        try {
          if (firstByte === 60 || firstByte === "<") {
            results = plist_1.default.parse(aStringOrBuffer.toString());
          } else if (firstByte === 98) {
            results = bplist_parser_1.default.parseBuffer(aStringOrBuffer)[0];
          } else if (aFile) {
            throw new Error("Unable to determine format for '" + aFile + "'");
          } else {
            throw new Error("Unable to determine format for plist aStringOrBuffer");
          }
        } catch (error) {
          throw error instanceof Error ? error : new Error("error parsing " + aFile);
        }
        return results;
      }
      exports3.parse = parse;
    });
  }
});

// node_modules/simple-plist/dist/readFile.js
var require_readFile = __commonJS({
  "node_modules/simple-plist/dist/readFile.js"(exports2, module2) {
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    (function(factory) {
      if (typeof module2 === "object" && typeof module2.exports === "object") {
        var v = factory(require, exports2);
        if (v !== void 0) module2.exports = v;
      } else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "fs", "./parse"], factory);
      }
    })(function(_umdRequire, exports3) {
      "use strict";
      Object.defineProperty(exports3, "__esModule", { value: true });
      exports3.readFile = void 0;
      var fs_1 = __importDefault(require("fs"));
      var parse_1 = require_parse2();
      function readFile(aFile, callback) {
        fs_1.default.readFile(aFile, function(err, contents) {
          if (err) {
            return callback(err);
          }
          var results;
          try {
            results = (0, parse_1.parse)(contents, aFile);
          } catch (error) {
            return callback(error instanceof Error ? error : new Error("failed to read file " + aFile));
          }
          callback(null, results);
        });
      }
      exports3.readFile = readFile;
    });
  }
});

// node_modules/simple-plist/dist/readFileSync.js
var require_readFileSync = __commonJS({
  "node_modules/simple-plist/dist/readFileSync.js"(exports2, module2) {
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    (function(factory) {
      if (typeof module2 === "object" && typeof module2.exports === "object") {
        var v = factory(require, exports2);
        if (v !== void 0) module2.exports = v;
      } else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "fs", "./parse"], factory);
      }
    })(function(_umdRequire, exports3) {
      "use strict";
      Object.defineProperty(exports3, "__esModule", { value: true });
      exports3.readFileSync = void 0;
      var fs_1 = __importDefault(require("fs"));
      var parse_1 = require_parse2();
      function readFileSync(aFile) {
        var contents = fs_1.default.readFileSync(aFile);
        if (contents.length === 0) {
          return {};
        }
        return (0, parse_1.parse)(contents, aFile);
      }
      exports3.readFileSync = readFileSync;
    });
  }
});

// node_modules/simple-plist/dist/stringify.js
var require_stringify = __commonJS({
  "node_modules/simple-plist/dist/stringify.js"(exports2, module2) {
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    (function(factory) {
      if (typeof module2 === "object" && typeof module2.exports === "object") {
        var v = factory(require, exports2);
        if (v !== void 0) module2.exports = v;
      } else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "plist"], factory);
      }
    })(function(_umdRequire, exports3) {
      "use strict";
      Object.defineProperty(exports3, "__esModule", { value: true });
      exports3.stringify = void 0;
      var plist_1 = __importDefault(require_plist());
      function stringify(anObject) {
        return plist_1.default.build(anObject);
      }
      exports3.stringify = stringify;
    });
  }
});

// node_modules/simple-plist/dist/writeBinaryFile.js
var require_writeBinaryFile = __commonJS({
  "node_modules/simple-plist/dist/writeBinaryFile.js"(exports2, module2) {
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    (function(factory) {
      if (typeof module2 === "object" && typeof module2.exports === "object") {
        var v = factory(require, exports2);
        if (v !== void 0) module2.exports = v;
      } else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "bplist-creator", "fs"], factory);
      }
    })(function(_umdRequire, exports3) {
      "use strict";
      Object.defineProperty(exports3, "__esModule", { value: true });
      exports3.writeBinaryFile = void 0;
      var bplist_creator_1 = __importDefault(require_bplistCreator());
      var fs_1 = __importDefault(require("fs"));
      function writeBinaryFile(aFile, anObject, options, callback) {
        if (typeof options === "function" && callback === void 0) {
          fs_1.default.writeFile(aFile, (0, bplist_creator_1.default)(anObject), options);
        } else if (typeof options === "object" && typeof callback === "function") {
          fs_1.default.writeFile(aFile, (0, bplist_creator_1.default)(anObject), options, callback);
        } else {
          throw new Error("Invalid parameters passed to writeBinaryFile");
        }
      }
      exports3.writeBinaryFile = writeBinaryFile;
    });
  }
});

// node_modules/simple-plist/dist/writeBinaryFileSync.js
var require_writeBinaryFileSync = __commonJS({
  "node_modules/simple-plist/dist/writeBinaryFileSync.js"(exports2, module2) {
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    (function(factory) {
      if (typeof module2 === "object" && typeof module2.exports === "object") {
        var v = factory(require, exports2);
        if (v !== void 0) module2.exports = v;
      } else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "bplist-creator", "fs"], factory);
      }
    })(function(_umdRequire, exports3) {
      "use strict";
      Object.defineProperty(exports3, "__esModule", { value: true });
      exports3.writeBinaryFileSync = void 0;
      var bplist_creator_1 = __importDefault(require_bplistCreator());
      var fs_1 = __importDefault(require("fs"));
      function writeBinaryFileSync(aFile, anObject, options) {
        return fs_1.default.writeFileSync(aFile, (0, bplist_creator_1.default)(anObject), options);
      }
      exports3.writeBinaryFileSync = writeBinaryFileSync;
    });
  }
});

// node_modules/simple-plist/dist/writeFile.js
var require_writeFile = __commonJS({
  "node_modules/simple-plist/dist/writeFile.js"(exports2, module2) {
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    (function(factory) {
      if (typeof module2 === "object" && typeof module2.exports === "object") {
        var v = factory(require, exports2);
        if (v !== void 0) module2.exports = v;
      } else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "fs", "plist"], factory);
      }
    })(function(_umdRequire, exports3) {
      "use strict";
      Object.defineProperty(exports3, "__esModule", { value: true });
      exports3.writeFile = void 0;
      var fs_1 = __importDefault(require("fs"));
      var plist_1 = __importDefault(require_plist());
      function writeFile(aFile, anObject, options, callback) {
        if (typeof options === "function" && callback === void 0) {
          fs_1.default.writeFile(aFile, plist_1.default.build(anObject), options);
        } else if (typeof options === "object" && typeof callback === "function") {
          fs_1.default.writeFile(aFile, plist_1.default.build(anObject), options, callback);
        } else {
          throw new Error("Invalid parameters passed to writeFile");
        }
      }
      exports3.writeFile = writeFile;
    });
  }
});

// node_modules/simple-plist/dist/writeFileSync.js
var require_writeFileSync = __commonJS({
  "node_modules/simple-plist/dist/writeFileSync.js"(exports2, module2) {
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    (function(factory) {
      if (typeof module2 === "object" && typeof module2.exports === "object") {
        var v = factory(require, exports2);
        if (v !== void 0) module2.exports = v;
      } else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "fs", "plist"], factory);
      }
    })(function(_umdRequire, exports3) {
      "use strict";
      Object.defineProperty(exports3, "__esModule", { value: true });
      exports3.writeFileSync = void 0;
      var fs_1 = __importDefault(require("fs"));
      var plist_1 = __importDefault(require_plist());
      function writeFileSync(aFile, anObject, options) {
        var data = plist_1.default.build(anObject);
        return fs_1.default.writeFileSync(aFile, data, options);
      }
      exports3.writeFileSync = writeFileSync;
    });
  }
});

// node_modules/simple-plist/dist/index.js
var require_dist2 = __commonJS({
  "node_modules/simple-plist/dist/index.js"(exports2, module2) {
    var __importDefault = exports2 && exports2.__importDefault || function(mod) {
      return mod && mod.__esModule ? mod : { "default": mod };
    };
    (function(factory) {
      if (typeof module2 === "object" && typeof module2.exports === "object") {
        var v = factory(require, exports2);
        if (v !== void 0) module2.exports = v;
      } else if (typeof define === "function" && define.amd) {
        define(["require", "exports", "bplist-creator", "bplist-parser", "./parse", "./readFile", "./readFileSync", "./stringify", "./writeBinaryFile", "./writeBinaryFileSync", "./writeFile", "./writeFileSync"], factory);
      }
    })(function(_umdRequire, exports3) {
      "use strict";
      Object.defineProperty(exports3, "__esModule", { value: true });
      var bplist_creator_1 = __importDefault(require_bplistCreator());
      var bplist_parser_1 = __importDefault(require_bplistParser());
      var parse_1 = require_parse2();
      var readFile_1 = require_readFile();
      var readFileSync_1 = require_readFileSync();
      var stringify_1 = require_stringify();
      var writeBinaryFile_1 = require_writeBinaryFile();
      var writeBinaryFileSync_1 = require_writeBinaryFileSync();
      var writeFile_1 = require_writeFile();
      var writeFileSync_1 = require_writeFileSync();
      var SimplePlist = {
        bplistCreator: bplist_creator_1.default,
        bplistParser: bplist_parser_1.default,
        parse: parse_1.parse,
        readFile: readFile_1.readFile,
        readFileSync: readFileSync_1.readFileSync,
        stringify: stringify_1.stringify,
        writeBinaryFile: writeBinaryFile_1.writeBinaryFile,
        writeBinaryFileSync: writeBinaryFileSync_1.writeBinaryFileSync,
        writeFile: writeFile_1.writeFile,
        writeFileSync: writeFileSync_1.writeFileSync
      };
      exports3.default = SimplePlist;
      module2.exports = SimplePlist;
    });
  }
});

// node_modules/xcode/lib/pbxProject.js
var require_pbxProject = __commonJS({
  "node_modules/xcode/lib/pbxProject.js"(exports2, module2) {
    var util = require("util");
    var f = util.format;
    var EventEmitter = require("events").EventEmitter;
    var path2 = require("path");
    var uuid = require_dist();
    var fork = require("child_process").fork;
    var pbxWriter = require_pbxWriter();
    var pbxFile = require_pbxFile();
    var fs2 = require("fs");
    var parser = require_pbxproj();
    var plist = require_dist2();
    var COMMENT_KEY = /_comment$/;
    function pbxProject(filename) {
      if (!(this instanceof pbxProject))
        return new pbxProject(filename);
      this.filepath = path2.resolve(filename);
    }
    util.inherits(pbxProject, EventEmitter);
    pbxProject.prototype.parse = function(cb) {
      var worker = fork(__dirname + "/parseJob.js", [this.filepath]);
      worker.on("message", function(msg) {
        if (msg.name == "SyntaxError" || msg.code) {
          this.emit("error", msg);
        } else {
          this.hash = msg;
          this.emit("end", null, msg);
        }
      }.bind(this));
      if (cb) {
        this.on("error", cb);
        this.on("end", cb);
      }
      return this;
    };
    pbxProject.prototype.parseSync = function() {
      var file_contents = fs2.readFileSync(this.filepath, "utf-8");
      this.hash = parser.parse(file_contents);
      return this;
    };
    pbxProject.prototype.writeSync = function(options) {
      this.writer = new pbxWriter(this.hash, options);
      return this.writer.writeSync();
    };
    pbxProject.prototype.allUuids = function() {
      var sections = this.hash.project.objects, uuids = [], section;
      for (key in sections) {
        section = sections[key];
        uuids = uuids.concat(Object.keys(section));
      }
      uuids = uuids.filter(function(str) {
        return !COMMENT_KEY.test(str) && str.length == 24;
      });
      return uuids;
    };
    pbxProject.prototype.generateUuid = function() {
      var id = uuid.v4().replace(/-/g, "").substr(0, 24).toUpperCase();
      if (this.allUuids().indexOf(id) >= 0) {
        return this.generateUuid();
      } else {
        return id;
      }
    };
    pbxProject.prototype.addPluginFile = function(path3, opt) {
      var file = new pbxFile(path3, opt);
      file.plugin = true;
      correctForPluginsPath(file, this);
      if (this.hasFile(file.path)) return null;
      file.fileRef = this.generateUuid();
      this.addToPbxFileReferenceSection(file);
      this.addToPluginsPbxGroup(file);
      return file;
    };
    pbxProject.prototype.removePluginFile = function(path3, opt) {
      var file = new pbxFile(path3, opt);
      correctForPluginsPath(file, this);
      this.removeFromPbxFileReferenceSection(file);
      this.removeFromPluginsPbxGroup(file);
      return file;
    };
    pbxProject.prototype.addProductFile = function(targetPath, opt) {
      var file = new pbxFile(targetPath, opt);
      file.includeInIndex = 0;
      file.fileRef = this.generateUuid();
      file.target = opt ? opt.target : void 0;
      file.group = opt ? opt.group : void 0;
      file.uuid = this.generateUuid();
      file.path = file.basename;
      this.addToPbxFileReferenceSection(file);
      this.addToProductsPbxGroup(file);
      return file;
    };
    pbxProject.prototype.removeProductFile = function(path3, opt) {
      var file = new pbxFile(path3, opt);
      this.removeFromProductsPbxGroup(file);
      return file;
    };
    pbxProject.prototype.addSourceFile = function(path3, opt, group) {
      var file;
      if (group) {
        file = this.addFile(path3, group, opt);
      } else {
        file = this.addPluginFile(path3, opt);
      }
      if (!file) return false;
      file.target = opt ? opt.target : void 0;
      file.uuid = this.generateUuid();
      this.addToPbxBuildFileSection(file);
      this.addToPbxSourcesBuildPhase(file);
      return file;
    };
    pbxProject.prototype.removeSourceFile = function(path3, opt, group) {
      var file;
      if (group) {
        file = this.removeFile(path3, group, opt);
      } else {
        file = this.removePluginFile(path3, opt);
      }
      file.target = opt ? opt.target : void 0;
      this.removeFromPbxBuildFileSection(file);
      this.removeFromPbxSourcesBuildPhase(file);
      return file;
    };
    pbxProject.prototype.addHeaderFile = function(path3, opt, group) {
      if (group) {
        return this.addFile(path3, group, opt);
      } else {
        return this.addPluginFile(path3, opt);
      }
    };
    pbxProject.prototype.removeHeaderFile = function(path3, opt, group) {
      if (group) {
        return this.removeFile(path3, group, opt);
      } else {
        return this.removePluginFile(path3, opt);
      }
    };
    pbxProject.prototype.addResourceFile = function(path3, opt, group) {
      opt = opt || {};
      var file;
      if (opt.plugin) {
        file = this.addPluginFile(path3, opt);
        if (!file) return false;
      } else {
        file = new pbxFile(path3, opt);
        if (this.hasFile(file.path)) return false;
      }
      file.uuid = this.generateUuid();
      file.target = opt ? opt.target : void 0;
      if (!opt.plugin) {
        correctForResourcesPath(file, this);
        file.fileRef = this.generateUuid();
      }
      if (!opt.variantGroup) {
        this.addToPbxBuildFileSection(file);
        this.addToPbxResourcesBuildPhase(file);
      }
      if (!opt.plugin) {
        this.addToPbxFileReferenceSection(file);
        if (group) {
          if (this.getPBXGroupByKey(group)) {
            this.addToPbxGroup(file, group);
          } else if (this.getPBXVariantGroupByKey(group)) {
            this.addToPbxVariantGroup(file, group);
          }
        } else {
          this.addToResourcesPbxGroup(file);
        }
      }
      return file;
    };
    pbxProject.prototype.removeResourceFile = function(path3, opt, group) {
      var file = new pbxFile(path3, opt);
      file.target = opt ? opt.target : void 0;
      correctForResourcesPath(file, this);
      this.removeFromPbxBuildFileSection(file);
      this.removeFromPbxFileReferenceSection(file);
      if (group) {
        if (this.getPBXGroupByKey(group)) {
          this.removeFromPbxGroup(file, group);
        } else if (this.getPBXVariantGroupByKey(group)) {
          this.removeFromPbxVariantGroup(file, group);
        }
      } else {
        this.removeFromResourcesPbxGroup(file);
      }
      this.removeFromPbxResourcesBuildPhase(file);
      return file;
    };
    pbxProject.prototype.addFramework = function(fpath, opt) {
      var customFramework = opt && opt.customFramework == true;
      var link = !opt || (opt.link == void 0 || opt.link);
      var embed = opt && opt.embed;
      if (opt) {
        delete opt.embed;
      }
      var file = new pbxFile(fpath, opt);
      file.uuid = this.generateUuid();
      file.fileRef = this.generateUuid();
      file.target = opt ? opt.target : void 0;
      if (this.hasFile(file.path)) return false;
      this.addToPbxBuildFileSection(file);
      this.addToPbxFileReferenceSection(file);
      this.addToFrameworksPbxGroup(file);
      if (link) {
        this.addToPbxFrameworksBuildPhase(file);
      }
      if (customFramework) {
        this.addToFrameworkSearchPaths(file);
        if (embed) {
          opt.embed = embed;
          var embeddedFile = new pbxFile(fpath, opt);
          embeddedFile.uuid = this.generateUuid();
          embeddedFile.fileRef = file.fileRef;
          this.addToPbxBuildFileSection(embeddedFile);
          this.addToPbxEmbedFrameworksBuildPhase(embeddedFile);
          return embeddedFile;
        }
      }
      return file;
    };
    pbxProject.prototype.removeFramework = function(fpath, opt) {
      var embed = opt && opt.embed;
      if (opt) {
        delete opt.embed;
      }
      var file = new pbxFile(fpath, opt);
      file.target = opt ? opt.target : void 0;
      this.removeFromPbxBuildFileSection(file);
      this.removeFromPbxFileReferenceSection(file);
      this.removeFromFrameworksPbxGroup(file);
      this.removeFromPbxFrameworksBuildPhase(file);
      if (opt && opt.customFramework) {
        this.removeFromFrameworkSearchPaths(file);
      }
      opt = opt || {};
      opt.embed = true;
      var embeddedFile = new pbxFile(fpath, opt);
      embeddedFile.fileRef = file.fileRef;
      this.removeFromPbxBuildFileSection(embeddedFile);
      this.removeFromPbxEmbedFrameworksBuildPhase(embeddedFile);
      return file;
    };
    pbxProject.prototype.addCopyfile = function(fpath, opt) {
      var file = new pbxFile(fpath, opt);
      if (this.hasFile(file.path)) {
        file = this.hasFile(file.path);
      }
      file.fileRef = file.uuid = this.generateUuid();
      file.target = opt ? opt.target : void 0;
      this.addToPbxBuildFileSection(file);
      this.addToPbxFileReferenceSection(file);
      this.addToPbxCopyfilesBuildPhase(file);
      return file;
    };
    pbxProject.prototype.pbxCopyfilesBuildPhaseObj = function(target) {
      return this.buildPhaseObject("PBXCopyFilesBuildPhase", "Copy Files", target);
    };
    pbxProject.prototype.addToPbxCopyfilesBuildPhase = function(file) {
      var sources = this.buildPhaseObject("PBXCopyFilesBuildPhase", "Copy Files", file.target);
      sources.files.push(pbxBuildPhaseObj(file));
    };
    pbxProject.prototype.removeCopyfile = function(fpath, opt) {
      var file = new pbxFile(fpath, opt);
      file.target = opt ? opt.target : void 0;
      this.removeFromPbxBuildFileSection(file);
      this.removeFromPbxFileReferenceSection(file);
      this.removeFromPbxCopyfilesBuildPhase(file);
      return file;
    };
    pbxProject.prototype.removeFromPbxCopyfilesBuildPhase = function(file) {
      var sources = this.pbxCopyfilesBuildPhaseObj(file.target);
      for (i in sources.files) {
        if (sources.files[i].comment == longComment(file)) {
          sources.files.splice(i, 1);
          break;
        }
      }
    };
    pbxProject.prototype.addStaticLibrary = function(path3, opt) {
      opt = opt || {};
      var file;
      if (opt.plugin) {
        file = this.addPluginFile(path3, opt);
        if (!file) return false;
      } else {
        file = new pbxFile(path3, opt);
        if (this.hasFile(file.path)) return false;
      }
      file.uuid = this.generateUuid();
      file.target = opt ? opt.target : void 0;
      if (!opt.plugin) {
        file.fileRef = this.generateUuid();
        this.addToPbxFileReferenceSection(file);
      }
      this.addToPbxBuildFileSection(file);
      this.addToPbxFrameworksBuildPhase(file);
      this.addToLibrarySearchPaths(file);
      return file;
    };
    pbxProject.prototype.addToPbxBuildFileSection = function(file) {
      var commentKey = f("%s_comment", file.uuid);
      this.pbxBuildFileSection()[file.uuid] = pbxBuildFileObj(file);
      this.pbxBuildFileSection()[commentKey] = pbxBuildFileComment(file);
    };
    pbxProject.prototype.removeFromPbxBuildFileSection = function(file) {
      var uuid2;
      for (uuid2 in this.pbxBuildFileSection()) {
        if (this.pbxBuildFileSection()[uuid2].fileRef_comment == file.basename) {
          file.uuid = uuid2;
          delete this.pbxBuildFileSection()[uuid2];
          var commentKey = f("%s_comment", uuid2);
          delete this.pbxBuildFileSection()[commentKey];
        }
      }
    };
    pbxProject.prototype.addPbxGroup = function(filePathsArray, name, path3, sourceTree) {
      var groups = this.hash.project.objects["PBXGroup"], pbxGroupUuid = this.generateUuid(), commentKey = f("%s_comment", pbxGroupUuid), pbxGroup = {
        isa: "PBXGroup",
        children: [],
        name,
        path: path3,
        sourceTree: sourceTree ? sourceTree : '"<group>"'
      }, fileReferenceSection = this.pbxFileReferenceSection(), filePathToReference = {};
      for (var key2 in fileReferenceSection) {
        if (!COMMENT_KEY.test(key2)) continue;
        var fileReferenceKey = key2.split(COMMENT_KEY)[0], fileReference2 = fileReferenceSection[fileReferenceKey];
        filePathToReference[fileReference2.path] = { fileRef: fileReferenceKey, basename: fileReferenceSection[key2] };
      }
      for (var index = 0; index < filePathsArray.length; index++) {
        var filePath = filePathsArray[index], filePathQuoted = '"' + filePath + '"';
        if (filePathToReference[filePath]) {
          pbxGroup.children.push(pbxGroupChild(filePathToReference[filePath]));
          continue;
        } else if (filePathToReference[filePathQuoted]) {
          pbxGroup.children.push(pbxGroupChild(filePathToReference[filePathQuoted]));
          continue;
        }
        var file = new pbxFile(filePath);
        file.uuid = this.generateUuid();
        file.fileRef = this.generateUuid();
        this.addToPbxFileReferenceSection(file);
        this.addToPbxBuildFileSection(file);
        pbxGroup.children.push(pbxGroupChild(file));
      }
      if (groups) {
        groups[pbxGroupUuid] = pbxGroup;
        groups[commentKey] = name;
      }
      return { uuid: pbxGroupUuid, pbxGroup };
    };
    pbxProject.prototype.removePbxGroup = function(groupName) {
      var section = this.hash.project.objects["PBXGroup"], key2, itemKey;
      for (key2 in section) {
        if (!COMMENT_KEY.test(key2)) continue;
        if (section[key2] == groupName) {
          itemKey = key2.split(COMMENT_KEY)[0];
          delete section[itemKey];
        }
      }
    };
    pbxProject.prototype.addToPbxProjectSection = function(target) {
      var newTarget = {
        value: target.uuid,
        comment: pbxNativeTargetComment(target.pbxNativeTarget)
      };
      this.pbxProjectSection()[this.getFirstProject()["uuid"]]["targets"].push(newTarget);
    };
    pbxProject.prototype.addToPbxNativeTargetSection = function(target) {
      var commentKey = f("%s_comment", target.uuid);
      this.pbxNativeTargetSection()[target.uuid] = target.pbxNativeTarget;
      this.pbxNativeTargetSection()[commentKey] = target.pbxNativeTarget.name;
    };
    pbxProject.prototype.addToPbxFileReferenceSection = function(file) {
      var commentKey = f("%s_comment", file.fileRef);
      this.pbxFileReferenceSection()[file.fileRef] = pbxFileReferenceObj(file);
      this.pbxFileReferenceSection()[commentKey] = pbxFileReferenceComment(file);
    };
    pbxProject.prototype.removeFromPbxFileReferenceSection = function(file) {
      var i2;
      var refObj = pbxFileReferenceObj(file);
      for (i2 in this.pbxFileReferenceSection()) {
        if (this.pbxFileReferenceSection()[i2].name == refObj.name || '"' + this.pbxFileReferenceSection()[i2].name + '"' == refObj.name || this.pbxFileReferenceSection()[i2].path == refObj.path || '"' + this.pbxFileReferenceSection()[i2].path + '"' == refObj.path) {
          file.fileRef = file.uuid = i2;
          delete this.pbxFileReferenceSection()[i2];
          break;
        }
      }
      var commentKey = f("%s_comment", file.fileRef);
      if (this.pbxFileReferenceSection()[commentKey] != void 0) {
        delete this.pbxFileReferenceSection()[commentKey];
      }
      return file;
    };
    pbxProject.prototype.addToXcVersionGroupSection = function(file) {
      if (!file.models || !file.currentModel) {
        throw new Error("Cannot create a XCVersionGroup section from not a data model document file");
      }
      var commentKey = f("%s_comment", file.fileRef);
      if (!this.xcVersionGroupSection()[file.fileRef]) {
        this.xcVersionGroupSection()[file.fileRef] = {
          isa: "XCVersionGroup",
          children: file.models.map(function(el) {
            return el.fileRef;
          }),
          currentVersion: file.currentModel.fileRef,
          name: path2.basename(file.path),
          path: file.path,
          sourceTree: '"<group>"',
          versionGroupType: "wrapper.xcdatamodel"
        };
        this.xcVersionGroupSection()[commentKey] = path2.basename(file.path);
      }
    };
    pbxProject.prototype.addToPluginsPbxGroup = function(file) {
      var pluginsGroup = this.pbxGroupByName("Plugins");
      if (!pluginsGroup) {
        this.addPbxGroup([file.path], "Plugins");
      } else {
        pluginsGroup.children.push(pbxGroupChild(file));
      }
    };
    pbxProject.prototype.removeFromPluginsPbxGroup = function(file) {
      if (!this.pbxGroupByName("Plugins")) {
        return null;
      }
      var pluginsGroupChildren = this.pbxGroupByName("Plugins").children, i2;
      for (i2 in pluginsGroupChildren) {
        if (pbxGroupChild(file).value == pluginsGroupChildren[i2].value && pbxGroupChild(file).comment == pluginsGroupChildren[i2].comment) {
          pluginsGroupChildren.splice(i2, 1);
          break;
        }
      }
    };
    pbxProject.prototype.addToResourcesPbxGroup = function(file) {
      var pluginsGroup = this.pbxGroupByName("Resources");
      if (!pluginsGroup) {
        this.addPbxGroup([file.path], "Resources");
      } else {
        pluginsGroup.children.push(pbxGroupChild(file));
      }
    };
    pbxProject.prototype.removeFromResourcesPbxGroup = function(file) {
      if (!this.pbxGroupByName("Resources")) {
        return null;
      }
      var pluginsGroupChildren = this.pbxGroupByName("Resources").children, i2;
      for (i2 in pluginsGroupChildren) {
        if (pbxGroupChild(file).value == pluginsGroupChildren[i2].value && pbxGroupChild(file).comment == pluginsGroupChildren[i2].comment) {
          pluginsGroupChildren.splice(i2, 1);
          break;
        }
      }
    };
    pbxProject.prototype.addToFrameworksPbxGroup = function(file) {
      var pluginsGroup = this.pbxGroupByName("Frameworks");
      if (!pluginsGroup) {
        this.addPbxGroup([file.path], "Frameworks");
      } else {
        pluginsGroup.children.push(pbxGroupChild(file));
      }
    };
    pbxProject.prototype.removeFromFrameworksPbxGroup = function(file) {
      if (!this.pbxGroupByName("Frameworks")) {
        return null;
      }
      var pluginsGroupChildren = this.pbxGroupByName("Frameworks").children;
      for (i in pluginsGroupChildren) {
        if (pbxGroupChild(file).value == pluginsGroupChildren[i].value && pbxGroupChild(file).comment == pluginsGroupChildren[i].comment) {
          pluginsGroupChildren.splice(i, 1);
          break;
        }
      }
    };
    pbxProject.prototype.addToPbxEmbedFrameworksBuildPhase = function(file) {
      var sources = this.pbxEmbedFrameworksBuildPhaseObj(file.target);
      if (sources) {
        sources.files.push(pbxBuildPhaseObj(file));
      }
    };
    pbxProject.prototype.removeFromPbxEmbedFrameworksBuildPhase = function(file) {
      var sources = this.pbxEmbedFrameworksBuildPhaseObj(file.target);
      if (sources) {
        var files = [];
        for (i in sources.files) {
          if (sources.files[i].comment != longComment(file)) {
            files.push(sources.files[i]);
          }
        }
        sources.files = files;
      }
    };
    pbxProject.prototype.addToProductsPbxGroup = function(file) {
      var productsGroup = this.pbxGroupByName("Products");
      if (!productsGroup) {
        this.addPbxGroup([file.path], "Products");
      } else {
        productsGroup.children.push(pbxGroupChild(file));
      }
    };
    pbxProject.prototype.removeFromProductsPbxGroup = function(file) {
      if (!this.pbxGroupByName("Products")) {
        return null;
      }
      var productsGroupChildren = this.pbxGroupByName("Products").children, i2;
      for (i2 in productsGroupChildren) {
        if (pbxGroupChild(file).value == productsGroupChildren[i2].value && pbxGroupChild(file).comment == productsGroupChildren[i2].comment) {
          productsGroupChildren.splice(i2, 1);
          break;
        }
      }
    };
    pbxProject.prototype.addToPbxSourcesBuildPhase = function(file) {
      var sources = this.pbxSourcesBuildPhaseObj(file.target);
      sources.files.push(pbxBuildPhaseObj(file));
    };
    pbxProject.prototype.removeFromPbxSourcesBuildPhase = function(file) {
      var sources = this.pbxSourcesBuildPhaseObj(file.target), i2;
      for (i2 in sources.files) {
        if (sources.files[i2].comment == longComment(file)) {
          sources.files.splice(i2, 1);
          break;
        }
      }
    };
    pbxProject.prototype.addToPbxResourcesBuildPhase = function(file) {
      var sources = this.pbxResourcesBuildPhaseObj(file.target);
      sources.files.push(pbxBuildPhaseObj(file));
    };
    pbxProject.prototype.removeFromPbxResourcesBuildPhase = function(file) {
      var sources = this.pbxResourcesBuildPhaseObj(file.target), i2;
      for (i2 in sources.files) {
        if (sources.files[i2].comment == longComment(file)) {
          sources.files.splice(i2, 1);
          break;
        }
      }
    };
    pbxProject.prototype.addToPbxFrameworksBuildPhase = function(file) {
      var sources = this.pbxFrameworksBuildPhaseObj(file.target);
      sources.files.push(pbxBuildPhaseObj(file));
    };
    pbxProject.prototype.removeFromPbxFrameworksBuildPhase = function(file) {
      var sources = this.pbxFrameworksBuildPhaseObj(file.target);
      for (i in sources.files) {
        if (sources.files[i].comment == longComment(file)) {
          sources.files.splice(i, 1);
          break;
        }
      }
    };
    pbxProject.prototype.addXCConfigurationList = function(configurationObjectsArray, defaultConfigurationName, comment) {
      var pbxBuildConfigurationSection = this.pbxXCBuildConfigurationSection(), pbxXCConfigurationListSection = this.pbxXCConfigurationList(), xcConfigurationListUuid = this.generateUuid(), commentKey = f("%s_comment", xcConfigurationListUuid), xcConfigurationList = {
        isa: "XCConfigurationList",
        buildConfigurations: [],
        defaultConfigurationIsVisible: 0,
        defaultConfigurationName
      };
      for (var index = 0; index < configurationObjectsArray.length; index++) {
        var configuration = configurationObjectsArray[index], configurationUuid = this.generateUuid(), configurationCommentKey = f("%s_comment", configurationUuid);
        pbxBuildConfigurationSection[configurationUuid] = configuration;
        pbxBuildConfigurationSection[configurationCommentKey] = configuration.name;
        xcConfigurationList.buildConfigurations.push({ value: configurationUuid, comment: configuration.name });
      }
      if (pbxXCConfigurationListSection) {
        pbxXCConfigurationListSection[xcConfigurationListUuid] = xcConfigurationList;
        pbxXCConfigurationListSection[commentKey] = comment;
      }
      return { uuid: xcConfigurationListUuid, xcConfigurationList };
    };
    pbxProject.prototype.addTargetDependency = function(target, dependencyTargets) {
      if (!target)
        return void 0;
      var nativeTargets = this.pbxNativeTargetSection();
      if (typeof nativeTargets[target] == "undefined")
        throw new Error("Invalid target: " + target);
      for (var index = 0; index < dependencyTargets.length; index++) {
        var dependencyTarget = dependencyTargets[index];
        if (typeof nativeTargets[dependencyTarget] == "undefined")
          throw new Error("Invalid target: " + dependencyTarget);
      }
      var pbxTargetDependency = "PBXTargetDependency", pbxContainerItemProxy = "PBXContainerItemProxy", pbxTargetDependencySection = this.hash.project.objects[pbxTargetDependency], pbxContainerItemProxySection = this.hash.project.objects[pbxContainerItemProxy];
      for (var index = 0; index < dependencyTargets.length; index++) {
        var dependencyTargetUuid = dependencyTargets[index], dependencyTargetCommentKey = f("%s_comment", dependencyTargetUuid), targetDependencyUuid = this.generateUuid(), targetDependencyCommentKey = f("%s_comment", targetDependencyUuid), itemProxyUuid = this.generateUuid(), itemProxyCommentKey = f("%s_comment", itemProxyUuid), itemProxy = {
          isa: pbxContainerItemProxy,
          containerPortal: this.hash.project["rootObject"],
          containerPortal_comment: this.hash.project["rootObject_comment"],
          proxyType: 1,
          remoteGlobalIDString: dependencyTargetUuid,
          remoteInfo: nativeTargets[dependencyTargetUuid].name
        }, targetDependency = {
          isa: pbxTargetDependency,
          target: dependencyTargetUuid,
          target_comment: nativeTargets[dependencyTargetCommentKey],
          targetProxy: itemProxyUuid,
          targetProxy_comment: pbxContainerItemProxy
        };
        if (pbxContainerItemProxySection && pbxTargetDependencySection) {
          pbxContainerItemProxySection[itemProxyUuid] = itemProxy;
          pbxContainerItemProxySection[itemProxyCommentKey] = pbxContainerItemProxy;
          pbxTargetDependencySection[targetDependencyUuid] = targetDependency;
          pbxTargetDependencySection[targetDependencyCommentKey] = pbxTargetDependency;
          nativeTargets[target].dependencies.push({ value: targetDependencyUuid, comment: pbxTargetDependency });
        }
      }
      return { uuid: target, target: nativeTargets[target] };
    };
    pbxProject.prototype.addBuildPhase = function(filePathsArray, buildPhaseType, comment, target, optionsOrFolderType, subfolderPath) {
      var buildPhaseSection, fileReferenceSection = this.pbxFileReferenceSection(), buildFileSection = this.pbxBuildFileSection(), buildPhaseUuid = this.generateUuid(), buildPhaseTargetUuid = target || this.getFirstTarget().uuid, commentKey = f("%s_comment", buildPhaseUuid), buildPhase = {
        isa: buildPhaseType,
        buildActionMask: 2147483647,
        files: [],
        runOnlyForDeploymentPostprocessing: 0
      }, filePathToBuildFile = {};
      if (buildPhaseType === "PBXCopyFilesBuildPhase") {
        buildPhase = pbxCopyFilesBuildPhaseObj(buildPhase, optionsOrFolderType, subfolderPath, comment);
      } else if (buildPhaseType === "PBXShellScriptBuildPhase") {
        buildPhase = pbxShellScriptBuildPhaseObj(buildPhase, optionsOrFolderType, comment);
      }
      if (!this.hash.project.objects[buildPhaseType]) {
        this.hash.project.objects[buildPhaseType] = new Object();
      }
      if (!this.hash.project.objects[buildPhaseType][buildPhaseUuid]) {
        this.hash.project.objects[buildPhaseType][buildPhaseUuid] = buildPhase;
        this.hash.project.objects[buildPhaseType][commentKey] = comment;
      }
      if (this.hash.project.objects["PBXNativeTarget"][buildPhaseTargetUuid]["buildPhases"]) {
        this.hash.project.objects["PBXNativeTarget"][buildPhaseTargetUuid]["buildPhases"].push({
          value: buildPhaseUuid,
          comment
        });
      }
      for (var key2 in buildFileSection) {
        if (!COMMENT_KEY.test(key2)) continue;
        var buildFileKey = key2.split(COMMENT_KEY)[0], buildFile = buildFileSection[buildFileKey];
        fileReference = fileReferenceSection[buildFile.fileRef];
        if (!fileReference) continue;
        var pbxFileObj = new pbxFile(fileReference.path);
        filePathToBuildFile[fileReference.path] = { uuid: buildFileKey, basename: pbxFileObj.basename, group: pbxFileObj.group };
      }
      for (var index = 0; index < filePathsArray.length; index++) {
        var filePath = filePathsArray[index], filePathQuoted = '"' + filePath + '"', file = new pbxFile(filePath);
        if (filePathToBuildFile[filePath]) {
          buildPhase.files.push(pbxBuildPhaseObj(filePathToBuildFile[filePath]));
          continue;
        } else if (filePathToBuildFile[filePathQuoted]) {
          buildPhase.files.push(pbxBuildPhaseObj(filePathToBuildFile[filePathQuoted]));
          continue;
        }
        file.uuid = this.generateUuid();
        file.fileRef = this.generateUuid();
        this.addToPbxFileReferenceSection(file);
        this.addToPbxBuildFileSection(file);
        buildPhase.files.push(pbxBuildPhaseObj(file));
      }
      if (buildPhaseSection) {
        buildPhaseSection[buildPhaseUuid] = buildPhase;
        buildPhaseSection[commentKey] = comment;
      }
      return { uuid: buildPhaseUuid, buildPhase };
    };
    pbxProject.prototype.pbxProjectSection = function() {
      return this.hash.project.objects["PBXProject"];
    };
    pbxProject.prototype.pbxBuildFileSection = function() {
      return this.hash.project.objects["PBXBuildFile"];
    };
    pbxProject.prototype.pbxXCBuildConfigurationSection = function() {
      return this.hash.project.objects["XCBuildConfiguration"];
    };
    pbxProject.prototype.pbxFileReferenceSection = function() {
      return this.hash.project.objects["PBXFileReference"];
    };
    pbxProject.prototype.pbxNativeTargetSection = function() {
      return this.hash.project.objects["PBXNativeTarget"];
    };
    pbxProject.prototype.xcVersionGroupSection = function() {
      if (typeof this.hash.project.objects["XCVersionGroup"] !== "object") {
        this.hash.project.objects["XCVersionGroup"] = {};
      }
      return this.hash.project.objects["XCVersionGroup"];
    };
    pbxProject.prototype.pbxXCConfigurationList = function() {
      return this.hash.project.objects["XCConfigurationList"];
    };
    pbxProject.prototype.pbxGroupByName = function(name) {
      var groups = this.hash.project.objects["PBXGroup"], key2, groupKey;
      for (key2 in groups) {
        if (!COMMENT_KEY.test(key2)) continue;
        if (groups[key2] == name) {
          groupKey = key2.split(COMMENT_KEY)[0];
          return groups[groupKey];
        }
      }
      return null;
    };
    pbxProject.prototype.pbxTargetByName = function(name) {
      return this.pbxItemByComment(name, "PBXNativeTarget");
    };
    pbxProject.prototype.findTargetKey = function(name) {
      var targets = this.hash.project.objects["PBXNativeTarget"];
      for (var key2 in targets) {
        if (COMMENT_KEY.test(key2)) continue;
        var target = targets[key2];
        if (target.name === name) {
          return key2;
        }
      }
      return null;
    };
    pbxProject.prototype.pbxItemByComment = function(name, pbxSectionName) {
      var section = this.hash.project.objects[pbxSectionName], key2, itemKey;
      for (key2 in section) {
        if (!COMMENT_KEY.test(key2)) continue;
        if (section[key2] == name) {
          itemKey = key2.split(COMMENT_KEY)[0];
          return section[itemKey];
        }
      }
      return null;
    };
    pbxProject.prototype.pbxSourcesBuildPhaseObj = function(target) {
      return this.buildPhaseObject("PBXSourcesBuildPhase", "Sources", target);
    };
    pbxProject.prototype.pbxResourcesBuildPhaseObj = function(target) {
      return this.buildPhaseObject("PBXResourcesBuildPhase", "Resources", target);
    };
    pbxProject.prototype.pbxFrameworksBuildPhaseObj = function(target) {
      return this.buildPhaseObject("PBXFrameworksBuildPhase", "Frameworks", target);
    };
    pbxProject.prototype.pbxEmbedFrameworksBuildPhaseObj = function(target) {
      return this.buildPhaseObject("PBXCopyFilesBuildPhase", "Embed Frameworks", target);
    };
    pbxProject.prototype.buildPhase = function(group, target) {
      if (!target)
        return void 0;
      var nativeTargets = this.pbxNativeTargetSection();
      if (typeof nativeTargets[target] == "undefined")
        throw new Error("Invalid target: " + target);
      var nativeTarget = nativeTargets[target];
      var buildPhases = nativeTarget.buildPhases;
      for (var i2 in buildPhases) {
        var buildPhase = buildPhases[i2];
        if (buildPhase.comment == group)
          return buildPhase.value + "_comment";
      }
    };
    pbxProject.prototype.buildPhaseObject = function(name, group, target) {
      var section = this.hash.project.objects[name], obj, sectionKey, key2;
      var buildPhase = this.buildPhase(group, target);
      for (key2 in section) {
        if (!COMMENT_KEY.test(key2)) continue;
        if (buildPhase && buildPhase != key2)
          continue;
        if (section[key2] == group) {
          sectionKey = key2.split(COMMENT_KEY)[0];
          return section[sectionKey];
        }
      }
      return null;
    };
    pbxProject.prototype.addBuildProperty = function(prop, value, build_name) {
      var configurations = nonComments(this.pbxXCBuildConfigurationSection()), key2, configuration;
      for (key2 in configurations) {
        configuration = configurations[key2];
        if (!build_name || configuration.name === build_name) {
          configuration.buildSettings[prop] = value;
        }
      }
    };
    pbxProject.prototype.removeBuildProperty = function(prop, build_name) {
      var configurations = nonComments(this.pbxXCBuildConfigurationSection()), key2, configuration;
      for (key2 in configurations) {
        configuration = configurations[key2];
        if (configuration.buildSettings[prop] && !build_name || configuration.name === build_name) {
          delete configuration.buildSettings[prop];
        }
      }
    };
    pbxProject.prototype.updateBuildProperty = function(prop, value, build, targetName) {
      let validConfigs = [];
      if (targetName) {
        const target = this.pbxTargetByName(targetName);
        const targetBuildConfigs = target && target.buildConfigurationList;
        const xcConfigList = this.pbxXCConfigurationList();
        for (const configName2 in xcConfigList) {
          if (!COMMENT_KEY.test(configName2) && targetBuildConfigs === configName2) {
            const buildVariants = xcConfigList[configName2].buildConfigurations;
            for (const item of buildVariants) {
              validConfigs.push(item.value);
            }
            break;
          }
        }
      }
      var configs = this.pbxXCBuildConfigurationSection();
      for (var configName in configs) {
        if (!COMMENT_KEY.test(configName)) {
          if (targetName && !validConfigs.includes(configName)) continue;
          var config = configs[configName];
          if (build && config.name === build || !build) {
            config.buildSettings[prop] = value;
          }
        }
      }
    };
    pbxProject.prototype.updateProductName = function(name) {
      this.updateBuildProperty("PRODUCT_NAME", '"' + name + '"');
    };
    pbxProject.prototype.removeFromFrameworkSearchPaths = function(file) {
      var configurations = nonComments(this.pbxXCBuildConfigurationSection()), INHERITED = '"$(inherited)"', SEARCH_PATHS = "FRAMEWORK_SEARCH_PATHS", config, buildSettings, searchPaths;
      var new_path = searchPathForFile(file, this);
      for (config in configurations) {
        buildSettings = configurations[config].buildSettings;
        if (unquote(buildSettings["PRODUCT_NAME"]) != this.productName)
          continue;
        searchPaths = buildSettings[SEARCH_PATHS];
        if (searchPaths && Array.isArray(searchPaths)) {
          var matches = searchPaths.filter(function(p) {
            return p.indexOf(new_path) > -1;
          });
          matches.forEach(function(m) {
            var idx = searchPaths.indexOf(m);
            searchPaths.splice(idx, 1);
          });
        }
      }
    };
    pbxProject.prototype.addToFrameworkSearchPaths = function(file) {
      var configurations = nonComments(this.pbxXCBuildConfigurationSection()), INHERITED = '"$(inherited)"', config, buildSettings, searchPaths;
      for (config in configurations) {
        buildSettings = configurations[config].buildSettings;
        if (unquote(buildSettings["PRODUCT_NAME"]) != this.productName)
          continue;
        if (!buildSettings["FRAMEWORK_SEARCH_PATHS"] || buildSettings["FRAMEWORK_SEARCH_PATHS"] === INHERITED) {
          buildSettings["FRAMEWORK_SEARCH_PATHS"] = [INHERITED];
        }
        buildSettings["FRAMEWORK_SEARCH_PATHS"].push(searchPathForFile(file, this));
      }
    };
    pbxProject.prototype.removeFromLibrarySearchPaths = function(file) {
      var configurations = nonComments(this.pbxXCBuildConfigurationSection()), INHERITED = '"$(inherited)"', SEARCH_PATHS = "LIBRARY_SEARCH_PATHS", config, buildSettings, searchPaths;
      var new_path = searchPathForFile(file, this);
      for (config in configurations) {
        buildSettings = configurations[config].buildSettings;
        if (unquote(buildSettings["PRODUCT_NAME"]) != this.productName)
          continue;
        searchPaths = buildSettings[SEARCH_PATHS];
        if (searchPaths && Array.isArray(searchPaths)) {
          var matches = searchPaths.filter(function(p) {
            return p.indexOf(new_path) > -1;
          });
          matches.forEach(function(m) {
            var idx = searchPaths.indexOf(m);
            searchPaths.splice(idx, 1);
          });
        }
      }
    };
    pbxProject.prototype.addToLibrarySearchPaths = function(file) {
      var configurations = nonComments(this.pbxXCBuildConfigurationSection()), INHERITED = '"$(inherited)"', config, buildSettings, searchPaths;
      for (config in configurations) {
        buildSettings = configurations[config].buildSettings;
        if (unquote(buildSettings["PRODUCT_NAME"]) != this.productName)
          continue;
        if (!buildSettings["LIBRARY_SEARCH_PATHS"] || buildSettings["LIBRARY_SEARCH_PATHS"] === INHERITED) {
          buildSettings["LIBRARY_SEARCH_PATHS"] = [INHERITED];
        }
        if (typeof file === "string") {
          buildSettings["LIBRARY_SEARCH_PATHS"].push(file);
        } else {
          buildSettings["LIBRARY_SEARCH_PATHS"].push(searchPathForFile(file, this));
        }
      }
    };
    pbxProject.prototype.removeFromHeaderSearchPaths = function(file) {
      var configurations = nonComments(this.pbxXCBuildConfigurationSection()), INHERITED = '"$(inherited)"', SEARCH_PATHS = "HEADER_SEARCH_PATHS", config, buildSettings, searchPaths;
      var new_path = searchPathForFile(file, this);
      for (config in configurations) {
        buildSettings = configurations[config].buildSettings;
        if (unquote(buildSettings["PRODUCT_NAME"]) != this.productName)
          continue;
        if (buildSettings[SEARCH_PATHS]) {
          var matches = buildSettings[SEARCH_PATHS].filter(function(p) {
            return p.indexOf(new_path) > -1;
          });
          matches.forEach(function(m) {
            var idx = buildSettings[SEARCH_PATHS].indexOf(m);
            buildSettings[SEARCH_PATHS].splice(idx, 1);
          });
        }
      }
    };
    pbxProject.prototype.addToHeaderSearchPaths = function(file) {
      var configurations = nonComments(this.pbxXCBuildConfigurationSection()), INHERITED = '"$(inherited)"', config, buildSettings, searchPaths;
      for (config in configurations) {
        buildSettings = configurations[config].buildSettings;
        if (unquote(buildSettings["PRODUCT_NAME"]) != this.productName)
          continue;
        if (!buildSettings["HEADER_SEARCH_PATHS"]) {
          buildSettings["HEADER_SEARCH_PATHS"] = [INHERITED];
        }
        if (typeof file === "string") {
          buildSettings["HEADER_SEARCH_PATHS"].push(file);
        } else {
          buildSettings["HEADER_SEARCH_PATHS"].push(searchPathForFile(file, this));
        }
      }
    };
    pbxProject.prototype.addToOtherLinkerFlags = function(flag) {
      var configurations = nonComments(this.pbxXCBuildConfigurationSection()), INHERITED = '"$(inherited)"', OTHER_LDFLAGS = "OTHER_LDFLAGS", config, buildSettings;
      for (config in configurations) {
        buildSettings = configurations[config].buildSettings;
        if (unquote(buildSettings["PRODUCT_NAME"]) != this.productName)
          continue;
        if (!buildSettings[OTHER_LDFLAGS] || buildSettings[OTHER_LDFLAGS] === INHERITED) {
          buildSettings[OTHER_LDFLAGS] = [INHERITED];
        }
        buildSettings[OTHER_LDFLAGS].push(flag);
      }
    };
    pbxProject.prototype.removeFromOtherLinkerFlags = function(flag) {
      var configurations = nonComments(this.pbxXCBuildConfigurationSection()), OTHER_LDFLAGS = "OTHER_LDFLAGS", config, buildSettings;
      for (config in configurations) {
        buildSettings = configurations[config].buildSettings;
        if (unquote(buildSettings["PRODUCT_NAME"]) != this.productName) {
          continue;
        }
        if (buildSettings[OTHER_LDFLAGS]) {
          var matches = buildSettings[OTHER_LDFLAGS].filter(function(p) {
            return p.indexOf(flag) > -1;
          });
          matches.forEach(function(m) {
            var idx = buildSettings[OTHER_LDFLAGS].indexOf(m);
            buildSettings[OTHER_LDFLAGS].splice(idx, 1);
          });
        }
      }
    };
    pbxProject.prototype.addToBuildSettings = function(buildSetting, value) {
      var configurations = nonComments(this.pbxXCBuildConfigurationSection()), config, buildSettings;
      for (config in configurations) {
        buildSettings = configurations[config].buildSettings;
        buildSettings[buildSetting] = value;
      }
    };
    pbxProject.prototype.removeFromBuildSettings = function(buildSetting) {
      var configurations = nonComments(this.pbxXCBuildConfigurationSection()), config, buildSettings;
      for (config in configurations) {
        buildSettings = configurations[config].buildSettings;
        if (buildSettings[buildSetting]) {
          delete buildSettings[buildSetting];
        }
      }
    };
    pbxProject.prototype.__defineGetter__("productName", function() {
      var configurations = nonComments(this.pbxXCBuildConfigurationSection()), config, productName;
      for (config in configurations) {
        productName = configurations[config].buildSettings["PRODUCT_NAME"];
        if (productName) {
          return unquote(productName);
        }
      }
    });
    pbxProject.prototype.hasFile = function(filePath) {
      var files = nonComments(this.pbxFileReferenceSection()), file, id;
      for (id in files) {
        file = files[id];
        if (file.path == filePath || file.path == '"' + filePath + '"') {
          return file;
        }
      }
      return false;
    };
    pbxProject.prototype.addTarget = function(name, type, subfolder, bundleId) {
      var targetUuid = this.generateUuid(), targetType = type, targetSubfolder = subfolder || name, targetName = name.trim(), targetBundleId = bundleId;
      if (!targetName) {
        throw new Error("Target name missing.");
      }
      if (!targetType) {
        throw new Error("Target type missing.");
      }
      if (!producttypeForTargettype(targetType)) {
        throw new Error("Target type invalid: " + targetType);
      }
      var buildConfigurationsList = [
        {
          name: "Debug",
          isa: "XCBuildConfiguration",
          buildSettings: {
            GCC_PREPROCESSOR_DEFINITIONS: ['"DEBUG=1"', '"$(inherited)"'],
            INFOPLIST_FILE: '"' + path2.join(targetSubfolder, targetSubfolder + '-Info.plist"'),
            LD_RUNPATH_SEARCH_PATHS: '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"',
            PRODUCT_NAME: '"' + targetName + '"',
            SKIP_INSTALL: "YES"
          }
        },
        {
          name: "Release",
          isa: "XCBuildConfiguration",
          buildSettings: {
            INFOPLIST_FILE: '"' + path2.join(targetSubfolder, targetSubfolder + '-Info.plist"'),
            LD_RUNPATH_SEARCH_PATHS: '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"',
            PRODUCT_NAME: '"' + targetName + '"',
            SKIP_INSTALL: "YES"
          }
        }
      ];
      if (targetBundleId) {
        buildConfigurationsList = buildConfigurationsList.map((elem) => {
          elem.buildSettings.PRODUCT_BUNDLE_IDENTIFIER = '"' + targetBundleId + '"';
          return elem;
        });
      }
      var buildConfigurations = this.addXCConfigurationList(buildConfigurationsList, "Release", 'Build configuration list for PBXNativeTarget "' + targetName + '"');
      var productName = targetName, productType = producttypeForTargettype(targetType), productFileType = filetypeForProducttype(productType), productFile = this.addProductFile(productName, { group: "Copy Files", "target": targetUuid, "explicitFileType": productFileType }), productFileName = productFile.basename;
      this.addToPbxBuildFileSection(productFile);
      var target = {
        uuid: targetUuid,
        pbxNativeTarget: {
          isa: "PBXNativeTarget",
          name: '"' + targetName + '"',
          productName: '"' + targetName + '"',
          productReference: productFile.fileRef,
          productType: '"' + producttypeForTargettype(targetType) + '"',
          buildConfigurationList: buildConfigurations.uuid,
          buildPhases: [],
          buildRules: [],
          dependencies: []
        }
      };
      this.addToPbxNativeTargetSection(target);
      if (targetType === "app_extension") {
        this.addBuildPhase([], "PBXCopyFilesBuildPhase", "Copy Files", this.getFirstTarget().uuid, targetType);
        this.addToPbxCopyfilesBuildPhase(productFile);
      } else if (targetType === "watch2_app") {
        this.addBuildPhase(
          [targetName + ".app"],
          "PBXCopyFilesBuildPhase",
          "Embed Watch Content",
          this.getFirstTarget().uuid,
          targetType,
          '"$(CONTENTS_FOLDER_PATH)/Watch"'
        );
      } else if (targetType === "watch2_extension") {
        var watch2Target = this.getTarget(producttypeForTargettype("watch2_app"));
        if (watch2Target) {
          this.addBuildPhase(
            [targetName + ".appex"],
            "PBXCopyFilesBuildPhase",
            "Embed App Extensions",
            watch2Target.uuid,
            targetType
          );
        }
      }
      this.addToPbxProjectSection(target);
      if (targetType === "watch2_extension") {
        var watch2Target = this.getTarget(producttypeForTargettype("watch2_app"));
        if (watch2Target) {
          this.addTargetDependency(watch2Target.uuid, [target.uuid]);
        }
      } else {
        this.addTargetDependency(this.getFirstTarget().uuid, [target.uuid]);
      }
      return target;
    };
    function pbxBuildFileObj(file) {
      var obj = /* @__PURE__ */ Object.create(null);
      obj.isa = "PBXBuildFile";
      obj.fileRef = file.fileRef;
      obj.fileRef_comment = file.basename;
      if (file.settings) obj.settings = file.settings;
      return obj;
    }
    function pbxFileReferenceObj(file) {
      var fileObject = {
        isa: "PBXFileReference",
        name: '"' + file.basename + '"',
        path: '"' + file.path.replace(/\\/g, "/") + '"',
        sourceTree: file.sourceTree,
        fileEncoding: file.fileEncoding,
        lastKnownFileType: file.lastKnownFileType,
        explicitFileType: file.explicitFileType,
        includeInIndex: file.includeInIndex
      };
      return fileObject;
    }
    function pbxGroupChild(file) {
      var obj = /* @__PURE__ */ Object.create(null);
      obj.value = file.fileRef;
      obj.comment = file.basename;
      return obj;
    }
    function pbxBuildPhaseObj(file) {
      var obj = /* @__PURE__ */ Object.create(null);
      obj.value = file.uuid;
      obj.comment = longComment(file);
      return obj;
    }
    function pbxCopyFilesBuildPhaseObj(obj, folderType, subfolderPath, phaseName) {
      var DESTINATION_BY_TARGETTYPE = {
        application: "wrapper",
        app_extension: "plugins",
        bundle: "wrapper",
        command_line_tool: "wrapper",
        dynamic_library: "products_directory",
        framework: "shared_frameworks",
        frameworks: "frameworks",
        static_library: "products_directory",
        unit_test_bundle: "wrapper",
        watch_app: "wrapper",
        watch2_app: "products_directory",
        watch_extension: "plugins",
        watch2_extension: "plugins"
      };
      var SUBFOLDERSPEC_BY_DESTINATION = {
        absolute_path: 0,
        executables: 6,
        frameworks: 10,
        java_resources: 15,
        plugins: 13,
        products_directory: 16,
        resources: 7,
        shared_frameworks: 11,
        shared_support: 12,
        wrapper: 1,
        xpc_services: 0
      };
      obj.name = '"' + phaseName + '"';
      obj.dstPath = subfolderPath || '""';
      obj.dstSubfolderSpec = SUBFOLDERSPEC_BY_DESTINATION[DESTINATION_BY_TARGETTYPE[folderType]];
      return obj;
    }
    function pbxShellScriptBuildPhaseObj(obj, options, phaseName) {
      obj.name = '"' + phaseName + '"';
      obj.inputPaths = options.inputPaths || [];
      obj.outputPaths = options.outputPaths || [];
      obj.shellPath = options.shellPath;
      obj.shellScript = '"' + options.shellScript.replace(/"/g, '\\"') + '"';
      return obj;
    }
    function pbxBuildFileComment(file) {
      return longComment(file);
    }
    function pbxFileReferenceComment(file) {
      return file.basename || path2.basename(file.path);
    }
    function pbxNativeTargetComment(target) {
      return target.name;
    }
    function longComment(file) {
      return f("%s in %s", file.basename, file.group);
    }
    function correctForPluginsPath(file, project) {
      return correctForPath(file, project, "Plugins");
    }
    function correctForResourcesPath(file, project) {
      return correctForPath(file, project, "Resources");
    }
    function correctForPath(file, project, group) {
      var r_group_dir = new RegExp("^" + group + "[\\\\/]");
      if (project.pbxGroupByName(group).path)
        file.path = file.path.replace(r_group_dir, "");
      return file;
    }
    function searchPathForFile(file, proj) {
      var plugins = proj.pbxGroupByName("Plugins"), pluginsPath = plugins ? plugins.path : null, fileDir = path2.dirname(file.path);
      if (fileDir == ".") {
        fileDir = "";
      } else {
        fileDir = "/" + fileDir;
      }
      if (file.plugin && pluginsPath) {
        return '"\\"$(SRCROOT)/' + unquote(pluginsPath) + '\\""';
      } else if (file.customFramework && file.dirname) {
        return '"\\"' + file.dirname + '\\""';
      } else {
        return '"\\"$(SRCROOT)/' + proj.productName + fileDir + '\\""';
      }
    }
    function nonComments(obj) {
      var keys = Object.keys(obj), newObj = {}, i2 = 0;
      for (i2; i2 < keys.length; i2++) {
        if (!COMMENT_KEY.test(keys[i2])) {
          newObj[keys[i2]] = obj[keys[i2]];
        }
      }
      return newObj;
    }
    function unquote(str) {
      if (str) return str.replace(/^"(.*)"$/, "$1");
    }
    function producttypeForTargettype(targetType) {
      PRODUCTTYPE_BY_TARGETTYPE = {
        application: "com.apple.product-type.application",
        app_extension: "com.apple.product-type.app-extension",
        bundle: "com.apple.product-type.bundle",
        command_line_tool: "com.apple.product-type.tool",
        dynamic_library: "com.apple.product-type.library.dynamic",
        framework: "com.apple.product-type.framework",
        static_library: "com.apple.product-type.library.static",
        unit_test_bundle: "com.apple.product-type.bundle.unit-test",
        watch_app: "com.apple.product-type.application.watchapp",
        watch2_app: "com.apple.product-type.application.watchapp2",
        watch_extension: "com.apple.product-type.watchkit-extension",
        watch2_extension: "com.apple.product-type.watchkit2-extension"
      };
      return PRODUCTTYPE_BY_TARGETTYPE[targetType];
    }
    function filetypeForProducttype(productType) {
      FILETYPE_BY_PRODUCTTYPE = {
        "com.apple.product-type.application": '"wrapper.application"',
        "com.apple.product-type.app-extension": '"wrapper.app-extension"',
        "com.apple.product-type.bundle": '"wrapper.plug-in"',
        "com.apple.product-type.tool": '"compiled.mach-o.dylib"',
        "com.apple.product-type.library.dynamic": '"compiled.mach-o.dylib"',
        "com.apple.product-type.framework": '"wrapper.framework"',
        "com.apple.product-type.library.static": '"archive.ar"',
        "com.apple.product-type.bundle.unit-test": '"wrapper.cfbundle"',
        "com.apple.product-type.application.watchapp": '"wrapper.application"',
        "com.apple.product-type.application.watchapp2": '"wrapper.application"',
        "com.apple.product-type.watchkit-extension": '"wrapper.app-extension"',
        "com.apple.product-type.watchkit2-extension": '"wrapper.app-extension"'
      };
      return FILETYPE_BY_PRODUCTTYPE[productType];
    }
    pbxProject.prototype.getFirstProject = function() {
      var pbxProjectContainer = this.pbxProjectSection();
      var firstProjectUuid = Object.keys(pbxProjectContainer)[0];
      var firstProject = pbxProjectContainer[firstProjectUuid];
      return {
        uuid: firstProjectUuid,
        firstProject
      };
    };
    pbxProject.prototype.getFirstTarget = function() {
      var firstTargetUuid = this.getFirstProject()["firstProject"]["targets"][0].value;
      var firstTarget = this.pbxNativeTargetSection()[firstTargetUuid];
      return {
        uuid: firstTargetUuid,
        firstTarget
      };
    };
    pbxProject.prototype.getTarget = function(productType) {
      var targets = this.getFirstProject()["firstProject"]["targets"];
      var nativeTargets = this.pbxNativeTargetSection();
      for (var i2 = 0; i2 < targets.length; i2++) {
        var target = targets[i2];
        var targetUuid = target.value;
        if (nativeTargets[targetUuid]["productType"] === '"' + productType + '"') {
          var nativeTarget = this.pbxNativeTargetSection()[targetUuid];
          return {
            uuid: targetUuid,
            target: nativeTarget
          };
        }
      }
      return null;
    };
    pbxProject.prototype.addToPbxGroupType = function(file, groupKey, groupType) {
      var group = this.getPBXGroupByKeyAndType(groupKey, groupType);
      if (group && group.children !== void 0) {
        if (typeof file === "string") {
          var childGroup = {
            value: file
          };
          if (this.getPBXGroupByKey(file)) {
            childGroup.comment = this.getPBXGroupByKey(file).name;
          } else if (this.getPBXVariantGroupByKey(file)) {
            childGroup.comment = this.getPBXVariantGroupByKey(file).name;
          }
          group.children.push(childGroup);
        } else {
          group.children.push(pbxGroupChild(file));
        }
      }
    };
    pbxProject.prototype.addToPbxVariantGroup = function(file, groupKey) {
      this.addToPbxGroupType(file, groupKey, "PBXVariantGroup");
    };
    pbxProject.prototype.addToPbxGroup = function(file, groupKey) {
      this.addToPbxGroupType(file, groupKey, "PBXGroup");
    };
    pbxProject.prototype.pbxCreateGroupWithType = function(name, pathName, groupType) {
      var model = {
        isa: '"' + groupType + '"',
        children: [],
        name,
        sourceTree: '"<group>"'
      };
      if (pathName) model.path = pathName;
      var key2 = this.generateUuid();
      var commendId = key2 + "_comment";
      var groups = this.hash.project.objects[groupType];
      if (!groups) {
        groups = this.hash.project.objects[groupType] = new Object();
      }
      groups[commendId] = name;
      groups[key2] = model;
      return key2;
    };
    pbxProject.prototype.pbxCreateVariantGroup = function(name) {
      return this.pbxCreateGroupWithType(name, void 0, "PBXVariantGroup");
    };
    pbxProject.prototype.pbxCreateGroup = function(name, pathName) {
      return this.pbxCreateGroupWithType(name, pathName, "PBXGroup");
    };
    pbxProject.prototype.removeFromPbxGroupAndType = function(file, groupKey, groupType) {
      var group = this.getPBXGroupByKeyAndType(groupKey, groupType);
      if (group) {
        var groupChildren = group.children, i2;
        for (i2 in groupChildren) {
          if (pbxGroupChild(file).value == groupChildren[i2].value && pbxGroupChild(file).comment == groupChildren[i2].comment) {
            groupChildren.splice(i2, 1);
            break;
          }
        }
      }
    };
    pbxProject.prototype.removeFromPbxGroup = function(file, groupKey) {
      this.removeFromPbxGroupAndType(file, groupKey, "PBXGroup");
    };
    pbxProject.prototype.removeFromPbxVariantGroup = function(file, groupKey) {
      this.removeFromPbxGroupAndType(file, groupKey, "PBXVariantGroup");
    };
    pbxProject.prototype.getPBXGroupByKeyAndType = function(key2, groupType) {
      return this.hash.project.objects[groupType][key2];
    };
    pbxProject.prototype.getPBXGroupByKey = function(key2) {
      return this.hash.project.objects["PBXGroup"][key2];
    };
    pbxProject.prototype.getPBXVariantGroupByKey = function(key2) {
      return this.hash.project.objects["PBXVariantGroup"][key2];
    };
    pbxProject.prototype.findPBXGroupKeyAndType = function(criteria, groupType) {
      var groups = this.hash.project.objects[groupType];
      var target;
      for (var key2 in groups) {
        if (COMMENT_KEY.test(key2)) continue;
        var group = groups[key2];
        if (criteria && criteria.path && criteria.name) {
          if (criteria.path === group.path && criteria.name === group.name) {
            target = key2;
            break;
          }
        } else if (criteria && criteria.path) {
          if (criteria.path === group.path) {
            target = key2;
            break;
          }
        } else if (criteria && criteria.name) {
          if (criteria.name === group.name) {
            target = key2;
            break;
          }
        }
      }
      return target;
    };
    pbxProject.prototype.findPBXGroupKey = function(criteria) {
      return this.findPBXGroupKeyAndType(criteria, "PBXGroup");
    };
    pbxProject.prototype.findPBXVariantGroupKey = function(criteria) {
      return this.findPBXGroupKeyAndType(criteria, "PBXVariantGroup");
    };
    pbxProject.prototype.addLocalizationVariantGroup = function(name) {
      var groupKey = this.pbxCreateVariantGroup(name);
      var resourceGroupKey = this.findPBXGroupKey({ name: "Resources" });
      this.addToPbxGroup(groupKey, resourceGroupKey);
      var localizationVariantGroup = {
        uuid: this.generateUuid(),
        fileRef: groupKey,
        basename: name
      };
      this.addToPbxBuildFileSection(localizationVariantGroup);
      this.addToPbxResourcesBuildPhase(localizationVariantGroup);
      return localizationVariantGroup;
    };
    pbxProject.prototype.addKnownRegion = function(name) {
      if (!this.pbxProjectSection()[this.getFirstProject()["uuid"]]["knownRegions"]) {
        this.pbxProjectSection()[this.getFirstProject()["uuid"]]["knownRegions"] = [];
      }
      if (!this.hasKnownRegion(name)) {
        this.pbxProjectSection()[this.getFirstProject()["uuid"]]["knownRegions"].push(name);
      }
    };
    pbxProject.prototype.removeKnownRegion = function(name) {
      var regions = this.pbxProjectSection()[this.getFirstProject()["uuid"]]["knownRegions"];
      if (regions) {
        for (var i2 = 0; i2 < regions.length; i2++) {
          if (regions[i2] === name) {
            regions.splice(i2, 1);
            break;
          }
        }
        this.pbxProjectSection()[this.getFirstProject()["uuid"]]["knownRegions"] = regions;
      }
    };
    pbxProject.prototype.hasKnownRegion = function(name) {
      var regions = this.pbxProjectSection()[this.getFirstProject()["uuid"]]["knownRegions"];
      if (regions) {
        for (var i2 in regions) {
          if (regions[i2] === name) {
            return true;
          }
        }
      }
      return false;
    };
    pbxProject.prototype.getPBXObject = function(name) {
      return this.hash.project.objects[name];
    };
    pbxProject.prototype.addFile = function(path3, group, opt) {
      var file = new pbxFile(path3, opt);
      if (this.hasFile(file.path)) return null;
      file.fileRef = this.generateUuid();
      this.addToPbxFileReferenceSection(file);
      if (this.getPBXGroupByKey(group)) {
        this.addToPbxGroup(file, group);
      } else if (this.getPBXVariantGroupByKey(group)) {
        this.addToPbxVariantGroup(file, group);
      }
      return file;
    };
    pbxProject.prototype.removeFile = function(path3, group, opt) {
      var file = new pbxFile(path3, opt);
      this.removeFromPbxFileReferenceSection(file);
      if (this.getPBXGroupByKey(group)) {
        this.removeFromPbxGroup(file, group);
      } else if (this.getPBXVariantGroupByKey(group)) {
        this.removeFromPbxVariantGroup(file, group);
      }
      return file;
    };
    pbxProject.prototype.getBuildProperty = function(prop, build, targetName) {
      var target;
      let validConfigs = [];
      if (targetName) {
        const target2 = this.pbxTargetByName(targetName);
        const targetBuildConfigs = target2 && target2.buildConfigurationList;
        const xcConfigList = this.pbxXCConfigurationList();
        for (const configName2 in xcConfigList) {
          if (!COMMENT_KEY.test(configName2) && targetBuildConfigs === configName2) {
            const buildVariants = xcConfigList[configName2].buildConfigurations;
            for (const item of buildVariants) {
              validConfigs.push(item.value);
            }
            break;
          }
        }
      }
      var configs = this.pbxXCBuildConfigurationSection();
      for (var configName in configs) {
        if (!COMMENT_KEY.test(configName)) {
          if (targetName && !validConfigs.includes(configName)) continue;
          var config = configs[configName];
          if (build && config.name === build || build === void 0) {
            if (config.buildSettings[prop] !== void 0) {
              target = config.buildSettings[prop];
            }
          }
        }
      }
      return target;
    };
    pbxProject.prototype.getBuildConfigByName = function(name) {
      var target = {};
      var configs = this.pbxXCBuildConfigurationSection();
      for (var configName in configs) {
        if (!COMMENT_KEY.test(configName)) {
          var config = configs[configName];
          if (config.name === name) {
            target[configName] = config;
          }
        }
      }
      return target;
    };
    pbxProject.prototype.addDataModelDocument = function(filePath, group, opt) {
      if (!group) {
        group = "Resources";
      }
      if (!this.getPBXGroupByKey(group)) {
        group = this.findPBXGroupKey({ name: group });
      }
      var file = new pbxFile(filePath, opt);
      if (!file || this.hasFile(file.path)) return null;
      file.fileRef = this.generateUuid();
      this.addToPbxGroup(file, group);
      if (!file) return false;
      file.target = opt ? opt.target : void 0;
      file.uuid = this.generateUuid();
      this.addToPbxBuildFileSection(file);
      this.addToPbxSourcesBuildPhase(file);
      file.models = [];
      var currentVersionName;
      var modelFiles = fs2.readdirSync(file.path);
      for (var index in modelFiles) {
        var modelFileName = modelFiles[index];
        var modelFilePath = path2.join(filePath, modelFileName);
        if (modelFileName == ".xccurrentversion") {
          currentVersionName = plist.readFileSync(modelFilePath)._XCCurrentVersionName;
          continue;
        }
        var modelFile = new pbxFile(modelFilePath);
        modelFile.fileRef = this.generateUuid();
        this.addToPbxFileReferenceSection(modelFile);
        file.models.push(modelFile);
        if (currentVersionName && currentVersionName === modelFileName) {
          file.currentModel = modelFile;
        }
      }
      if (!file.currentModel) {
        file.currentModel = file.models[0];
      }
      this.addToXcVersionGroupSection(file);
      return file;
    };
    pbxProject.prototype.addTargetAttribute = function(prop, value, target) {
      var attributes = this.getFirstProject()["firstProject"]["attributes"];
      if (attributes["TargetAttributes"] === void 0) {
        attributes["TargetAttributes"] = {};
      }
      target = target || this.getFirstTarget();
      if (attributes["TargetAttributes"][target.uuid] === void 0) {
        attributes["TargetAttributes"][target.uuid] = {};
      }
      attributes["TargetAttributes"][target.uuid][prop] = value;
    };
    pbxProject.prototype.removeTargetAttribute = function(prop, target) {
      var attributes = this.getFirstProject()["firstProject"]["attributes"];
      target = target || this.getFirstTarget();
      if (attributes["TargetAttributes"] && attributes["TargetAttributes"][target.uuid]) {
        delete attributes["TargetAttributes"][target.uuid][prop];
      }
    };
    module2.exports = pbxProject;
  }
});

// node_modules/xcode/index.js
var require_xcode = __commonJS({
  "node_modules/xcode/index.js"(exports2) {
    exports2.project = require_pbxProject();
  }
});

// bridge/extensions/canonical.json
var require_canonical = __commonJS({
  "bridge/extensions/canonical.json"(exports2, module2) {
    module2.exports = {
      "updates/native/boot.java": "8af30beb727b63060de36608f4aaeb53bd342bfb56941e71592edad52e01b893",
      "updates/native/boot.m": "ff7184b275db852140b6a1e1539032e9c3985698543098236501e0c16189b22e",
      "updates/prepare.cjs": "81cfc62fba12a37b84d45cef0bb2f1e3b05eb2959fe4282bda3e06f0060f29da",
      "fingerprint/dist/types.js": "8e609bb71c20b858c77f0e9f90bb1319db8477b13f9f965f1a1e18524bf50881",
      "fingerprint/dist/native-resolutions.js": "411a06ec66bb9adf8bea01dde1530eb43a2f2f2c8e8a4c2357f3b8d22d3b067a",
      "fingerprint/dist/index.js": "d39ac04919ae0782cc0367d4f8d37db8250a1dbc2e4c1e8096050452bb00583c",
      "fingerprint/dist/native-config.js": "52ba7cd597505ce6bc4b131e0aab71eb4a159c11a5278e80b4ee647dc9295ccb",
      "fingerprint/dist/cli.js": "9c2c3bf872fa3776382d75a776e30d3dc6790a8a499f30ae03c8c6933247d0e3",
      "fingerprint/dist/toolchain.js": "43c60db9a6229ec4dc6492d257321683f08b86d4e008e22773a73e7583a89a06"
    };
  }
});

// bridge/resolve/native-sources.cjs
var require_native_sources = __commonJS({
  "bridge/resolve/native-sources.cjs"(exports2, module2) {
    "use strict";
    var fs2 = require("node:fs");
    var path2 = require("node:path");
    var fail = (code) => {
      throw Object.assign(new Error("Invalid NativeSource declaration"), { code });
    };
    var inside = (root, file) => {
      const rel = path2.relative(root, file);
      return rel !== ".." && !rel.startsWith(".." + path2.sep) && !path2.isAbsolute(rel);
    };
    var ignored = /* @__PURE__ */ new Set(["node_modules", ".git", ".cache", ".turbo", "build", "dist", "Pods", ".gradle", "DerivedData"]);
    module2.exports = function expand(root, declarations) {
      if (declarations === void 0) return [];
      if (!Array.isArray(declarations)) fail("invalid_input");
      const names = /* @__PURE__ */ new Set();
      return declarations.map((group) => {
        if (!group || typeof group !== "object" || Array.isArray(group) || Object.keys(group).some((k) => !["name", "path"].includes(k)) || typeof group.name !== "string" || !group.name || names.has(group.name) || typeof group.path !== "string" || !group.path || group.path.includes("\0")) fail("invalid_input");
        names.add(group.name);
        const pattern = path2.resolve(root, group.path);
        const prefix = pattern.split(/[*?[\]{}]/, 1)[0];
        const logicalBase = path2.resolve(prefix.endsWith(path2.sep) ? prefix : path2.dirname(prefix));
        let base;
        try {
          base = fs2.realpathSync(logicalBase);
        } catch {
          fail("invalid_input");
        }
        const files = /* @__PURE__ */ new Map();
        function walk(file) {
          const stat = fs2.lstatSync(file);
          if (stat.isSymbolicLink()) fail("unavailable");
          const realPath = fs2.realpathSync(file);
          if (!inside(base, realPath)) fail("unavailable");
          if (stat.isDirectory()) {
            for (const name of fs2.readdirSync(file).sort()) if (!ignored.has(name)) walk(path2.join(file, name));
          } else if (stat.isFile()) {
            const ext = path2.extname(file).toLowerCase();
            const kind = ext === ".modulemap" ? "configuration" : [".swift", ".m", ".mm", ".h", ".c", ".cpp"].includes(ext) ? "source" : void 0;
            if (!kind) fail("unavailable");
            files.set(file, { path: file, realPath, kind });
          } else fail("unavailable");
        }
        try {
          for (const file of fs2.globSync(pattern)) walk(file);
        } catch (e) {
          if (["invalid_input", "unavailable"].includes(e.code)) throw e;
          fail("invalid_input");
        }
        if (!files.size) fail("invalid_input");
        return { name: group.name, pattern, logicalBase, base, files: [...files.values()].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0) };
      });
    };
  }
});

// bridge/extensions/ota.cjs
var require_ota = __commonJS({
  "bridge/extensions/ota.cjs"(exports2, module2) {
    "use strict";
    var fs2 = require("node:fs");
    var path2 = require("node:path");
    var { createRequire: createRequire2 } = require("node:module");
    var { pathToFileURL } = require("node:url");
    var { createHash } = require("node:crypto");
    function fail(code = "invalid_input") {
      throw Object.assign(new Error("Canonical OTA preparation failed"), { code });
    }
    function inside(root, file) {
      const rel = path2.relative(root, file);
      return rel !== ".." && !rel.startsWith(".." + path2.sep) && !path2.isAbsolute(rel);
    }
    module2.exports = async function(p) {
      const { projectDir, nativeDir, bundleDir, stageDir, platform, configuration, nativeConfig, architecture, destinationKind, extensionNative = [], projectStateDir, sourceFiles = {} } = p;
      if (![projectDir, nativeDir, bundleDir, stageDir].every((v) => typeof v === "string" && path2.isAbsolute(v)) || !inside(nativeDir, bundleDir) || !["ios", "android"].includes(platform) || !["release", "debug"].includes(configuration) || !nativeConfig || typeof nativeConfig !== "object") fail();
      if (projectStateDir !== void 0 && (typeof projectStateDir !== "string" || !path2.isAbsolute(projectStateDir) || inside(projectStateDir, projectDir) || !inside(projectStateDir, nativeDir) || !inside(projectStateDir, stageDir))) fail();
      const req = createRequire2(path2.join(projectDir, "package.json"));
      let producer, fingerprintFile;
      try {
        producer = req.resolve("@octane-xplat/updates/prepare");
        fingerprintFile = req.resolve("@octane-xplat/fingerprint");
      } catch {
        fail("unavailable");
      }
      if (JSON.parse(fs2.readFileSync(path2.join(path2.dirname(producer), "package.json"))).version !== "0.19.0" || JSON.parse(fs2.readFileSync(path2.join(path2.dirname(fingerprintFile), "../package.json"))).version !== "0.19.0") fail("unavailable");
      for (const [name, expected] of Object.entries(require_canonical())) {
        const [pkg, ...parts] = name.split("/");
        const base = pkg === "updates" ? path2.dirname(producer) : path2.resolve(path2.dirname(fingerprintFile), "..");
        if (createHash("sha256").update(fs2.readFileSync(path2.join(base, ...parts))).digest("hex") !== expected) fail("unavailable");
      }
      const canonical = await import(pathToFileURL(fingerprintFile).href);
      const evaluated = await canonical.resolveNativeConfigAsync(projectDir);
      const stable = (v) => JSON.stringify(v, (_, x) => x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x);
      if (stable(evaluated) !== stable(nativeConfig)) fail("unavailable");
      for (const key2 of ["appPath", "appResourcesPath"]) {
        const selected = nativeConfig[key2];
        if (selected !== void 0 && (typeof selected !== "string" || !inside(projectDir, path2.resolve(projectDir, selected)))) fail("unavailable");
      }
      const buildRoot = path2.resolve(projectDir, nativeConfig.buildPath ?? "platforms");
      if (!inside(projectDir, buildRoot) || buildRoot === projectDir) fail("unavailable");
      const sourceGroups = platform === "ios" ? require_native_sources()(projectDir, nativeConfig.ios?.NativeSource) : [];
      if (!sourceFiles || typeof sourceFiles !== "object" || Array.isArray(sourceFiles)) fail();
      const sourceDigest = (file) => createHash("sha256").update(fs2.readFileSync(file)).digest("hex");
      const checkSources = () => {
        for (const group of sourceGroups) for (const file of group.files) if (sourceFiles[file.realPath] !== sourceDigest(file.realPath)) fail();
      };
      checkSources();
      let anchor = projectDir;
      for (const group of sourceGroups) {
        const declaration = nativeConfig.ios.NativeSource.find((s) => s.name === group.name);
        if (path2.isAbsolute(declaration.path) && !inside(projectDir, group.logicalBase)) fail("unavailable");
        if (group.base !== group.logicalBase || group.files.some((file) => inside(path2.join(projectDir, "node_modules"), file.path))) fail("unavailable");
        while (!inside(anchor, group.logicalBase)) anchor = path2.dirname(anchor);
      }
      const snapshot = path2.join(stageDir, "project");
      const view = path2.join(snapshot, path2.relative(anchor, projectDir));
      fs2.mkdirSync(view, { recursive: true });
      const ignored = /* @__PURE__ */ new Set(["node_modules", ".git", ".xplat", ".xplat-ns"]);
      const excluded = (f) => inside(buildRoot, f) || inside(stageDir, f) || projectStateDir !== void 0 && inside(projectStateDir, f);
      const digest = (root) => {
        const h = createHash("sha256");
        function walk(dir) {
          for (const e of fs2.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
            const f = path2.join(dir, e.name);
            if (dir === root && ignored.has(e.name) || excluded(f)) continue;
            if (e.isSymbolicLink()) fail("unavailable");
            h.update(path2.relative(root, f));
            if (e.isDirectory()) walk(f);
            else h.update(fs2.readFileSync(f));
          }
        }
        walk(root);
        return h.digest("hex");
      };
      const before = digest(projectDir);
      const copy = (source, destination) => {
        if (excluded(source)) return;
        if (inside(source, stageDir) && fs2.lstatSync(source).isDirectory()) {
          fs2.mkdirSync(destination, { recursive: true });
          for (const e of fs2.readdirSync(source)) copy(path2.join(source, e), path2.join(destination, e));
        } else fs2.cpSync(source, destination, { recursive: true, dereference: false, filter: (source2) => !excluded(source2) });
      };
      for (const e of fs2.readdirSync(projectDir)) {
        if (!ignored.has(e)) copy(path2.join(projectDir, e), path2.join(view, e));
      }
      fs2.symlinkSync(path2.join(projectDir, "node_modules"), path2.join(view, "node_modules"), "dir");
      for (const group of sourceGroups) for (const file of group.files) {
        if (excluded(file.realPath) || excluded(file.path)) fail("unavailable");
        const destination = path2.join(snapshot, path2.relative(anchor, file.path));
        if (!inside(snapshot, destination)) fail();
        if (inside(path2.join(view, "node_modules"), destination)) fail("unavailable");
        fs2.mkdirSync(path2.dirname(destination), { recursive: true });
        fs2.copyFileSync(file.realPath, destination);
        if (sourceDigest(destination) !== sourceFiles[file.realPath]) fail();
      }
      const rebase = (v) => typeof v === "string" ? v.replaceAll(projectDir, view) : Array.isArray(v) ? v.map(rebase) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, rebase(x)])) : v;
      const config = rebase(nativeConfig);
      const extensionID = "xplat-ns/extension-native/v1";
      let extensionContents;
      if (!Array.isArray(extensionNative)) fail();
      if (extensionNative.length) {
        const seen = /* @__PURE__ */ new Set();
        const files = extensionNative.map((f) => {
          if (!f || Object.keys(f).sort().join(",") !== "kind,owner,path,platform,sha256,version" || typeof f.owner !== "string" || !f.owner || typeof f.version !== "string" || !f.version || f.platform !== platform || !["source", "resource", "configuration", "library", "framework"].includes(f.kind) || typeof f.path !== "string" || !f.path || path2.posix.isAbsolute(f.path) || path2.posix.normalize(f.path) !== f.path || f.path === ".." || f.path.startsWith("../") || /[\\:\x00]/.test(f.path) || !/^([a-f0-9]{64})$/.test(f.sha256)) fail();
          const key2 = JSON.stringify([f.owner, f.path.toLowerCase()]);
          if (seen.has(key2)) fail();
          seen.add(key2);
          return f;
        }).sort((a, b) => a.owner < b.owner ? -1 : a.owner > b.owner ? 1 : a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
        extensionContents = stable({ format: extensionID, files });
        const file = path2.join(view, "fingerprint.config.json");
        const fingerprintConfig = fs2.existsSync(file) ? JSON.parse(fs2.readFileSync(file)) : {};
        if (!fingerprintConfig || typeof fingerprintConfig !== "object" || Array.isArray(fingerprintConfig) || fingerprintConfig.extraSources !== void 0 && !Array.isArray(fingerprintConfig.extraSources)) fail();
        const extras = fingerprintConfig.extraSources ?? [];
        if (extras.some((s) => s && s.id === extensionID)) fail();
        fs2.writeFileSync(file, JSON.stringify({ ...fingerprintConfig, extraSources: [...extras, { type: "contents", id: extensionID, contents: extensionContents, reasons: ["extension-generated native inputs"] }] }));
      }
      const platforms = path2.resolve(view, config.buildPath ?? "platforms");
      const native = path2.join(platforms, platform);
      fs2.mkdirSync(path2.dirname(native), { recursive: true });
      fs2.cpSync(nativeDir, native, { recursive: true, dereference: true });
      const projectName = "NativeScriptApp";
      const emitted = platform === "ios" ? path2.join(native, projectName, "app") : path2.join(native, "app/src/main/assets/app");
      if (platform === "ios") {
        fs2.mkdirSync(path2.dirname(emitted), { recursive: true });
        fs2.cpSync(bundleDir, emitted, { recursive: true });
      }
      if (!fs2.existsSync(path2.join(emitted, "package.json"))) fail("unavailable");
      if (platform === "ios" && fs2.existsSync(path2.join(native, "Podfile")) && !fs2.existsSync(path2.join(native, "Podfile.lock"))) fail("unavailable");
      if (platform === "android" && !Array.from(fs2.globSync("**/{gradle.lockfile,dependency-locks/*.lockfile}", { cwd: native, exclude: ["**/build/**", "**/.gradle/**"] })).length) fail("unavailable");
      const toolchain = await canonical.captureNativeToolchainAsync(projectDir, platform);
      process.argv.push(destinationKind === "device" ? "--for-device" : "--emulator", "--arch", architecture);
      await req(producer)({ projectDir: view, platform, projectName, platformsDir: platforms, nativeConfig: config, toolchain, release: configuration === "release" });
      const recordFile = path2.join(view, ".xplat/fingerprints", platform + ".json");
      const record = JSON.parse(fs2.readFileSync(recordFile));
      const verified = await canonical.createFingerprintAsync(view, { platforms: [platform], nativeConfig: config, toolchain: record.toolchain });
      if (record.hash !== verified.hash || stable(record.sources) !== stable(verified.sources) || before !== digest(projectDir)) fail();
      checkSources();
      if (extensionContents !== void 0) {
        const source = record.sources.filter((s) => s.type === "contents" && s.id === extensionID);
        if (source.length !== 1 || source[0].hash !== createHash("sha256").update(extensionContents).digest("hex")) fail();
      }
      const stamp = JSON.parse(fs2.readFileSync(path2.join(emitted, "xplat-native.json")));
      if (stamp.hash !== record.hash || stamp.release !== (configuration === "release")) fail();
      const output = path2.join(stageDir, "native");
      fs2.cpSync(nativeDir, output, { recursive: true, dereference: true });
      const boot = platform === "ios" ? "internal/main.m" : "app/src/main/java/com/tns/NativeScriptApplication.java";
      fs2.copyFileSync(path2.join(native, boot), path2.join(output, boot));
      const outputBundle = path2.join(output, path2.relative(nativeDir, bundleDir));
      fs2.copyFileSync(path2.join(emitted, "xplat-native.json"), path2.join(outputBundle, "xplat-native.json"));
      const records = path2.join(output, ".xplat/fingerprints");
      fs2.mkdirSync(records, { recursive: true });
      fs2.copyFileSync(recordFile, path2.join(records, platform + ".json"));
      return { hash: record.hash, format: record.format, release: stamp.release };
    };
  }
});

// bridge/resolve/swift-packages.cjs
var require_swift_packages = __commonJS({
  "bridge/resolve/swift-packages.cjs"(exports2) {
    "use strict";
    var path2 = require("node:path");
    var fail = (code) => {
      throw Object.assign(new Error("Invalid Swift package declaration"), { code });
    };
    var version = "(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?";
    exports2.key = (url) => url.replace(/\/$/, "").replace(/\.git$/, "");
    exports2.requirement = (value) => {
      if (typeof value !== "string" || !value) fail("invalid_input");
      if (/^#[a-fA-F0-9]{40}$/.test(value)) return { kind: "revision", revision: value.slice(1).toLowerCase() };
      if (new RegExp("^" + version + "$").test(value)) return { kind: "exactVersion", version: value };
      if (new RegExp("^[\\^~]" + version + "$").test(value)) return { kind: value[0] === "^" ? "upToNextMajorVersion" : "upToNextMinorVersion", minimumVersion: value.slice(1) };
      if (/^[A-Za-z_][A-Za-z0-9_.\/-]*$/.test(value) && !value.includes("..") && !value.endsWith("/") && !value.endsWith(".lock")) return { kind: "branch", branch: value };
      fail("unavailable");
    };
    exports2.parse = (declarations) => {
      if (declarations === void 0) return [];
      if (!Array.isArray(declarations)) fail("invalid_input");
      const names = /* @__PURE__ */ new Set();
      return declarations.map((p) => {
        if (!p || typeof p !== "object" || Array.isArray(p) || Object.keys(p).some((k) => !["name", "repositoryURL", "version", "libs"].includes(k)) || typeof p.name !== "string" || !p.name || names.has(p.name) || typeof p.repositoryURL !== "string" || !Array.isArray(p.libs) || !p.libs.length || p.libs.some((n) => typeof n !== "string" || !n || !/^[-A-Za-z0-9_.]+$/.test(n))) fail("invalid_input");
        names.add(p.name);
        let url;
        try {
          url = new URL(p.repositoryURL);
        } catch {
          fail("invalid_input");
        }
        if (url.protocol !== "https:") fail("unavailable");
        if (url.username || url.password || url.search || url.hash || !path2.posix.basename(url.pathname)) fail("invalid_input");
        exports2.requirement(p.version);
        return { name: p.name, repositoryURL: url.href.replace(/\/$/, ""), version: p.version, products: [...new Set(p.libs)].sort() };
      });
    };
    exports2.merge = (contributions, app) => {
      const repos = /* @__PURE__ */ new Map(), names = /* @__PURE__ */ new Map(), identities = /* @__PURE__ */ new Map(), products = /* @__PURE__ */ new Map();
      for (const c of contributions) {
        if (c.kind !== "spm-remote") continue;
        const p = c.spm, key2 = exports2.key(p.repositoryURL);
        const identity = path2.posix.basename(new URL(key2).pathname).toLowerCase();
        if (names.has(p.name) && names.get(p.name) !== key2 || identities.has(identity) && identities.get(identity) !== key2) fail("invalid_input");
        names.set(p.name, key2);
        identities.set(identity, key2);
        for (const product of p.products) {
          if (products.has(product) && products.get(product) !== key2) fail("invalid_input");
          products.set(product, key2);
        }
        const entry = repos.get(key2) ?? [];
        entry.push(c);
        repos.set(key2, entry);
      }
      const merged = [];
      for (const entries of repos.values()) {
        entries.sort((a, b) => (b.packageDirectory === app) - (a.packageDirectory === app) || (a.packageDirectory < b.packageDirectory ? -1 : a.packageDirectory > b.packageDirectory ? 1 : 0) || (a.spm.name < b.spm.name ? -1 : a.spm.name > b.spm.name ? 1 : 0) || (a.spm.repositoryURL < b.spm.repositoryURL ? -1 : a.spm.repositoryURL > b.spm.repositoryURL ? 1 : 0));
        const selected = entries[0], versions = new Set(entries.map((c) => c.spm.version));
        if (new Set(entries.filter((c) => c.packageDirectory === app).map((c) => c.spm.version)).size > 1) fail("invalid_input");
        if (versions.size > 1 && selected.packageDirectory !== app) fail("invalid_input");
        const products2 = [...new Set(entries.flatMap((c) => c.spm.products))].sort();
        merged.push({ ...selected, spm: { ...selected.spm, products: products2 } });
      }
      return merged.sort((a, b) => a.spm.repositoryURL < b.spm.repositoryURL ? -1 : a.spm.repositoryURL > b.spm.repositoryURL ? 1 : 0);
    };
  }
});

// bridge/xcode/index.cjs
var require_xcode2 = __commonJS({
  "bridge/xcode/index.cjs"(exports2, module2) {
    "use strict";
    var fs2 = require("node:fs");
    var path2 = require("node:path");
    var crypto = require("node:crypto");
    var xcode2 = require_xcode();
    var plist = require_plist();
    var { execFileSync } = require("node:child_process");
    var swiftPackages = require_swift_packages();
    var fail = (code) => {
      throw Object.assign(new Error(), { code });
    };
    var q = (value) => JSON.stringify(value);
    var id = (value) => crypto.createHash("sha256").update(`p1:${value}`).digest("hex").slice(0, 24).toUpperCase();
    function dynamicFramework(file) {
      if (file.endsWith(".a")) return false;
      if (file.endsWith(".xcframework")) {
        let info;
        try {
          info = plist.parse(fs2.readFileSync(path2.join(file, "Info.plist"), "utf8"));
        } catch {
          fail("unavailable");
        }
        const kinds = (info.AvailableLibraries || []).filter((lib) => lib.SupportedPlatform === "ios" && [void 0, "simulator"].includes(lib.SupportedPlatformVariant)).map((lib) => dynamicFramework(path2.join(file, lib.LibraryIdentifier, lib.LibraryPath)));
        if (!kinds.length || kinds.some((k) => k !== kinds[0])) fail("unavailable");
        return kinds[0];
      }
      const binary = path2.join(file, path2.basename(file, ".framework"));
      let fd;
      try {
        fd = fs2.openSync(binary, "r");
        const b = Buffer.alloc(32);
        if (fs2.readSync(fd, b, 0, 32, 0) !== 32) fail("unavailable");
        let offset = 0;
        if (b.readUInt32BE(0) === 3405691582) offset = b.readUInt32BE(16);
        if (offset && fs2.readSync(fd, b, 0, 32, offset) !== 32) fail("unavailable");
        if (b.subarray(0, 8).toString() === "!<arch>\n") return false;
        const magic = b.readUInt32LE(0);
        const le = [4277009102, 4277009103].includes(magic);
        if (!le && ![3472551422, 3489328638].includes(magic)) fail("unavailable");
        const type = le ? b.readUInt32LE(12) : b.readUInt32BE(12);
        if (type !== 6 && type !== 1) fail("unavailable");
        return type === 6;
      } catch {
        fail("unavailable");
      } finally {
        if (fd !== void 0) fs2.closeSync(fd);
      }
    }
    var values = (section) => Object.entries(section || {}).filter(([key2, v]) => !key2.endsWith("_comment") && v && typeof v === "object");
    module2.exports = async ({ resolved, directory }) => {
      const normalize = (value) => Array.isArray(value) ? value.map(normalize) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k[0].toLowerCase() + k.slice(1), normalize(v)])) : value;
      resolved = normalize(resolved);
      if (!path2.isAbsolute(directory || "") || !resolved?.applicationID) fail("invalid_input");
      const runtime = resolved.packages.find((p) => p.name === "@nativescript/ios");
      if (!runtime || !["8.9.0", "9.1.0"].includes(runtime.version)) fail("unavailable");
      const template = path2.join(runtime.directory, "framework");
      if (!fs2.existsSync(path2.join(template, "__PROJECT_NAME__.xcodeproj/project.pbxproj"))) fail("unavailable");
      const name = "NativeScriptApp", projectFile = path2.join(directory, `${name}.xcodeproj/project.pbxproj`);
      const stateFile = path2.join(directory, ".p1.json");
      const previous = fs2.existsSync(stateFile) ? JSON.parse(fs2.readFileSync(stateFile)) : { ids: [] };
      if (previous.runtime && previous.runtime !== runtime.version) fail("unavailable");
      if (!fs2.existsSync(projectFile)) {
        fs2.mkdirSync(directory, { recursive: true });
        for (const entry of fs2.readdirSync(template)) {
          const dest = path2.join(directory, entry.replaceAll("__PROJECT_NAME__", name));
          if (fs2.existsSync(dest)) fail("invalid_input");
          fs2.cpSync(path2.join(template, entry), dest, { recursive: true, dereference: false, filter: (source) => !source.split(path2.sep).some((p) => p === "xcuserdata") });
        }
        const appDir = path2.join(directory, name);
        for (const entry of fs2.readdirSync(appDir)) {
          if (entry.includes("__PROJECT_NAME__")) fs2.renameSync(path2.join(appDir, entry), path2.join(appDir, entry.replaceAll("__PROJECT_NAME__", name)));
        }
        const schemes = path2.join(directory, `${name}.xcodeproj/xcshareddata/xcschemes`);
        if (fs2.existsSync(schemes)) for (const file of fs2.readdirSync(schemes)) {
          const text = fs2.readFileSync(path2.join(schemes, file), "utf8").replaceAll("__PROJECT_NAME__", name);
          fs2.unlinkSync(path2.join(schemes, file));
          fs2.writeFileSync(path2.join(schemes, file.replaceAll("__PROJECT_NAME__", name)), text);
        }
        fs2.writeFileSync(projectFile, fs2.readFileSync(projectFile, "utf8").replaceAll("__PROJECT_NAME__", name));
      }
      const internal = path2.join(directory, "internal");
      const archive = path2.join(internal, "XCFrameworks.zip");
      if (fs2.existsSync(archive) && !fs2.existsSync(path2.join(internal, "NativeScript.xcframework"))) {
        try {
          const names = execFileSync("/usr/bin/unzip", ["-Z1", archive], { encoding: "utf8", maxBuffer: 4 << 20 }).trim().split("\n");
          if (names.some((n) => path2.isAbsolute(n) || n.split("/").includes(".."))) fail("invalid_input");
          execFileSync("/usr/bin/unzip", ["-q", "-o", archive, "-d", internal], { stdio: "ignore" });
        } catch {
          fail("unavailable");
        }
        if (!fs2.existsSync(path2.join(internal, "NativeScript.xcframework/Info.plist")) || !fs2.existsSync(path2.join(internal, "TKLiveSync.xcframework/Info.plist"))) fail("unavailable");
      }
      const project = xcode2.project(projectFile);
      project.parseSync();
      const objects = project.hash.project.objects;
      const owned = new Set(previous.ids);
      for (const section of Object.values(objects)) {
        for (const key2 of Object.keys(section)) if (owned.has(key2.replace(/_comment$/, ""))) delete section[key2];
        for (const [, object] of values(section)) for (const [key2, value] of Object.entries(object)) {
          if (Array.isArray(value)) object[key2] = value.filter((v) => !owned.has(typeof v === "string" ? v : v.value));
        }
      }
      const ids = [];
      function put(section, key2, value) {
        const uuid = id(key2);
        if (objects[section]?.[uuid]) fail("invalid_input");
        (objects[section] ||= {})[uuid] = { isa: section, ...value };
        ids.push(uuid);
        return uuid;
      }
      const appTargets = values(objects.PBXNativeTarget).filter(([, v]) => v.productType === '"com.apple.product-type.application"' || v.productType === "com.apple.product-type.application");
      if (appTargets.length !== 1) fail("unavailable");
      const [targetID, target] = appTargets[0];
      const root = objects.PBXProject[project.hash.project.rootObject];
      const group = put("PBXGroup", "group", { name: q("NativeScript contributions"), sourceTree: q("<group>"), children: [] });
      objects.PBXGroup[root.mainGroup].children.push({ value: group, comment: "P1" });
      for (const [, ref] of values(objects.PBXFileReference)) {
        if (ref.path === "app" && ref.lastKnownFileType === "folder") ref.sourceTree = "SOURCE_ROOT";
      }
      const phases = {};
      for (const kind of ["Sources", "Resources", "Frameworks"]) {
        const isa = `PBX${kind}BuildPhase`;
        const existing = target.buildPhases.filter((ref) => objects[isa]?.[ref.value]);
        if (existing.length > 1) fail("unavailable");
        if (existing.length) phases[kind] = objects[isa][existing[0].value];
        else {
          const phase = put(isa, kind, { buildActionMask: 2147483647, files: [], runOnlyForDeploymentPostprocessing: 0 });
          target.buildPhases.push({ value: phase, comment: "P1" });
          phases[kind] = objects[isa][phase];
        }
      }
      const embedID = put("PBXCopyFilesBuildPhase", "embed", { buildActionMask: 2147483647, dstPath: q(""), dstSubfolderSpec: 10, name: q("Embed contributed frameworks"), files: [], runOnlyForDeploymentPostprocessing: 0 });
      target.buildPhases.push({ value: embedID, comment: "P1" });
      const headers = [], configs = [], pods = [], packages = [], modulemaps = [], remotePackages = [];
      const unquote = (value) => {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      };
      const productNames = new Set(values(objects.XCSwiftPackageProductDependency).map(([, p]) => unquote(p.productName)));
      let info = { CFBundleIdentifier: "$(PRODUCT_BUNDLE_IDENTIFIER)", CFBundleExecutable: "$(EXECUTABLE_NAME)", CFBundleName: name, CFBundlePackageType: "APPL", CFBundleVersion: "1", CFBundleShortVersionString: "1.0", LSRequiresIPhoneOS: true };
      let entitlements = plist.parse(fs2.readFileSync(path2.join(template, "__PROJECT_NAME__/__PROJECT_NAME__.entitlements"), "utf8"));
      const contributions = resolved.contributions.filter((c) => c.platform === "ios").sort((a, b) => (a.packageDirectory === resolved.directory) - (b.packageDirectory === resolved.directory) || a.path.localeCompare(b.path));
      for (const c of contributions) {
        if (!path2.isAbsolute(c.path) || !fs2.existsSync(c.path)) fail("invalid_input");
        const ext = path2.extname(c.path).toLowerCase();
        if (c.kind === "spm-remote") {
          const p = c.spm;
          if (!p || !Array.isArray(p.products) || !p.products.length) fail("invalid_input");
          const key2 = swiftPackages.key(p.repositoryURL);
          if (values(objects.XCRemoteSwiftPackageReference).some(([, ref3]) => swiftPackages.key(unquote(ref3.repositoryURL)) === key2)) fail("unavailable");
          const requirement = Object.fromEntries(Object.entries(swiftPackages.requirement(p.version)).map(([k, v]) => [k, q(v)]));
          const ref2 = put("XCRemoteSwiftPackageReference", "remote:" + key2, { repositoryURL: q(p.repositoryURL), requirement });
          (root.packageReferences ||= []).push({ value: ref2, comment: "P1" });
          for (const product of p.products) {
            if (productNames.has(product)) fail("unavailable");
            productNames.add(product);
            const dependency = put("XCSwiftPackageProductDependency", `remote:${key2}:${product}`, { package: ref2, productName: q(product) });
            (target.packageProductDependencies ||= []).push({ value: dependency, comment: "P1" });
            const build = put("PBXBuildFile", `remote-link:${key2}:${product}`, { productRef: dependency });
            phases.Frameworks.files.push({ value: build, comment: "P1" });
          }
          remotePackages.push(p);
          continue;
        }
        if (c.kind === "pods") {
          pods.push(c.path);
          continue;
        }
        if (c.kind === "spm") {
          let manifest;
          try {
            manifest = JSON.parse(execFileSync("swift", ["package", "--package-path", path2.dirname(c.path), "dump-package"], { encoding: "utf8", maxBuffer: 4 << 20, stdio: ["ignore", "pipe", "pipe"] }));
          } catch {
            fail("unavailable");
          }
          const ref2 = put("XCLocalSwiftPackageReference", c.path, { relativePath: q(path2.dirname(c.path)) });
          (root.packageReferences ||= []).push({ value: ref2, comment: "P1" });
          for (const product of manifest.products || []) {
            if (!product.type?.library) fail("unavailable");
            if (productNames.has(product.name)) fail("unavailable");
            productNames.add(product.name);
            const dependency = put("XCSwiftPackageProductDependency", `${c.path}:${product.name}`, { package: ref2, productName: q(product.name) });
            (target.packageProductDependencies ||= []).push({ value: dependency, comment: "P1" });
            const build = put("PBXBuildFile", `spm:${c.path}:${product.name}`, { productRef: dependency });
            phases.Frameworks.files.push({ value: build, comment: "P1" });
          }
          packages.push(c.path);
          continue;
        }
        if (c.kind === "configuration") {
          if (ext === ".modulemap") {
            modulemaps.push(c.path);
            continue;
          }
          if (ext === ".xcconfig") configs.push(c.path);
          else {
            let data;
            try {
              data = plist.parse(fs2.readFileSync(c.path, "utf8"));
            } catch {
              fail("unavailable");
            }
            if (ext === ".entitlements") Object.assign(entitlements, data);
            else if (path2.basename(c.path) === "Info.plist") Object.assign(info, data);
            else fail("unavailable");
          }
        }
        const types = { ".swift": "sourcecode.swift", ".m": "sourcecode.c.objc", ".mm": "sourcecode.cpp.objcpp", ".h": "sourcecode.c.h", ".c": "sourcecode.c.c", ".cpp": "sourcecode.cpp.cpp", ".framework": "wrapper.framework", ".xcframework": "wrapper.xcframework", ".a": "archive.ar", ".xcconfig": "text.xcconfig", ".plist": "text.plist.xml", ".entitlements": "text.plist.entitlements", ".xcassets": "folder.assetcatalog" };
        const ref = put("PBXFileReference", `file:${c.path}`, { path: q(c.path), sourceTree: q("<absolute>"), lastKnownFileType: types[ext] || (fs2.statSync(c.path).isDirectory() ? "folder" : "file") });
        objects.PBXGroup[group].children.push({ value: ref, comment: "P1" });
        if (ext === ".h") {
          headers.push(c.path);
          continue;
        }
        const phase = { source: "Sources", resource: "Resources", framework: "Frameworks" }[c.kind];
        if (phase) {
          const build = put("PBXBuildFile", `build:${c.path}`, { fileRef: ref });
          phases[phase].files.push({ value: build, comment: "P1" });
          if (c.kind === "framework" && dynamicFramework(c.path)) {
            const build2 = put("PBXBuildFile", `embed:${c.path}`, { fileRef: ref, settings: { ATTRIBUTES: ["CodeSignOnCopy", "RemoveHeadersOnCopy"] } });
            objects.PBXCopyFilesBuildPhase[embedID].files.push({ value: build2, comment: "P1" });
          }
        } else if (c.kind !== "configuration") fail("unavailable");
      }
      const configList = objects.XCConfigurationList[target.buildConfigurationList];
      for (const entry of configList.buildConfigurations) {
        const settings = objects.XCBuildConfiguration[entry.value].buildSettings;
        settings.PRODUCT_BUNDLE_IDENTIFIER = q(resolved.applicationID);
        settings.CODE_SIGN_ENTITLEMENTS = q(`${name}/${name}.entitlements`);
        settings.HEADER_SEARCH_PATHS = ['"$(inherited)"', q(q("$(SRCROOT)/internal")), q(q("$(SRCROOT)/internal/Swift-Modules")), q(q("$(SRCROOT)/internal/NativeContributions")), ...Array.from(new Set(headers.map((p) => q(q(path2.dirname(p))))))];
        settings.FRAMEWORK_SEARCH_PATHS = ['"$(inherited)"', ...Array.from(new Set(contributions.filter((c) => c.kind === "framework").map((c) => q(q(path2.dirname(c.path))))))];
      }
      const write = (file, text) => {
        fs2.mkdirSync(path2.dirname(file), { recursive: true });
        const temp = file + ".p1-tmp";
        fs2.writeFileSync(temp, text);
        fs2.renameSync(temp, file);
      };
      write(path2.join(directory, name, `${name}-Info.plist`), plist.build(info));
      write(path2.join(directory, name, `${name}.entitlements`), plist.build(entitlements));
      write(path2.join(directory, "internal/Swift-ObjC-Bridging-Header.h"), '#import <NativeScript/NativeScript.h>\n#import "NativeScriptStart.h"\n' + headers.map((p) => `#import ${q(p)}
`).join(""));
      write(path2.join(directory, "internal/NativeContributions/module.modulemap"), "module NativeContributions {\n" + headers.map((p) => `  header ${q(p)}
`).join("") + "  export *\n}\n");
      for (const mode of ["debug", "release"]) write(path2.join(directory, `plugins-${mode}.xcconfig`), `#include? "Pods/Target Support Files/Pods-${name}/Pods-${name}.${mode}.xcconfig"
` + (modulemaps.length ? `OTHER_CFLAGS = $(inherited) ${modulemaps.map((p) => "-fmodule-map-file=" + q(p)).join(" ")}
OTHER_SWIFT_FLAGS = $(inherited) ${modulemaps.map((p) => "-Xcc -fmodule-map-file=" + q(p)).join(" ")}
` : "") + configs.map((p) => `#include ${q(p)}
`).join(""));
      const ruby = (value) => `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
      if (pods.length || previous.pods) write(path2.join(directory, "Podfile"), `platform :ios, '13.0'
project '${name}.xcodeproj'
target '${name}' do
` + pods.map((p) => path2.extname(p) === ".podspec" ? `  pod ${ruby(path2.basename(p, ".podspec"))}, :path => ${ruby(path2.dirname(p))}
` : `  instance_eval(File.read(${ruby(p)}), ${ruby(p)})
`).join("") + "end\n");
      write(path2.join(directory, "metadata-inputs.json"), JSON.stringify({ schema: 1, runtime: runtime.version, revision: resolved.revision, headers, modulemaps, frameworks: contributions.filter((c) => c.kind === "framework").map((c) => c.path), pods, packages, remotePackages }, null, 2) + "\n");
      write(projectFile, project.writeSync());
      write(stateFile, JSON.stringify({ runtime: runtime.version, ids, pods: pods.length > 0 || !!previous.pods, spm: runtime.version === "9.1.0" || packages.length > 0 || remotePackages.length > 0 || !!previous.spm }) + "\n");
      fs2.mkdirSync(path2.join(directory, "app"), { recursive: true });
      const bundlePackage = path2.join(directory, "app/package.json");
      if (!fs2.existsSync(bundlePackage)) write(bundlePackage, JSON.stringify({ main: "bundle.js" }));
      return { directory, projectFile, pods: pods.length > 0 || !!previous.pods, spm: runtime.version === "9.1.0" || packages.length > 0 || remotePackages.length > 0 || !!previous.spm, target: name };
    };
  }
});

// bridge/vite/native-inputs.cjs
var require_native_inputs = __commonJS({
  "bridge/vite/native-inputs.cjs"(exports2, module2) {
    "use strict";
    var fs2 = require("node:fs");
    var path2 = require("node:path");
    var crypto = require("node:crypto");
    module2.exports = function nativeInputs(inputs, sources, groups = [], projectDir) {
      const baseline = new Map(sources.map((source) => [source.Path, source.Digest]));
      const packageRoots = sources.filter((source) => path2.basename(source.Path) === "Package.swift" || source.Path.endsWith(".podspec")).map((source) => path2.dirname(source.Path));
      const ignored = (file) => !baseline.has(file) && packageRoots.some((root) => {
        const relative = path2.relative(root, file);
        return relative !== ".." && !relative.startsWith(".." + path2.sep) && relative.split(path2.sep).some((part) => [".build", ".swiftpm"].includes(part));
      });
      const digest = (file) => crypto.createHash("sha256").update(fs2.readFileSync(file)).digest("hex");
      const configuredFiles = new Set(groups.flatMap((group) => group.files));
      function configuredChanged(file) {
        if (!groups.length || file && !groups.some((group) => file === group.root || file.startsWith(group.root + path2.sep))) return false;
        let selected;
        try {
          selected = new Set(require_native_sources()(projectDir, groups.map(({ name, path: path3 }) => ({ name, path: path3 }))).flatMap((group) => group.files.map((f) => f.realPath)));
        } catch {
          return true;
        }
        return selected.size !== configuredFiles.size || [...selected].some((file2) => !configuredFiles.has(file2) || baseline.get(file2) !== digest(file2));
      }
      function snapshot(root, result) {
        if (ignored(root)) return;
        let stat;
        try {
          stat = fs2.lstatSync(root);
        } catch (error) {
          if (error.code === "ENOENT") return;
          throw error;
        }
        if (stat.isSymbolicLink()) throw new Error("Native input symlink changed");
        if (stat.isDirectory()) {
          for (const name of fs2.readdirSync(root)) snapshot(path2.join(root, name), result);
        } else if (stat.isFile()) result.set(root, digest(root));
      }
      return (file) => {
        if (configuredChanged(file)) return true;
        if (file && (!inputs.some((input) => file === input || file.startsWith(input + path2.sep)) || ignored(file))) return false;
        const roots = file ? [file] : inputs;
        const current = /* @__PURE__ */ new Map();
        for (const root of roots) snapshot(root, current);
        const expected = new Map([...baseline].filter(([source]) => roots.some((root) => source === root || source.startsWith(root + path2.sep))));
        return current.size !== expected.size || [...current].some(([source, hash]) => expected.get(source) !== hash);
      };
    };
  }
});

// bridge/vite/native-update.cjs
var require_native_update = __commonJS({
  "bridge/vite/native-update.cjs"(exports2, module2) {
    "use strict";
    module2.exports = (framework) => {
      const strategy = framework.typescriptServerStrategy;
      const update = strategy.handleHotUpdate;
      strategy.handleHotUpdate = async (context, dependencies) => {
        framework.purgeTransformCachesForHotUpdate({ file: context.file, server: context.server, sharedTransformRequest: dependencies.sharedTransformRequest });
        const processed = /* @__PURE__ */ new Set();
        const graph = dependencies.moduleGraph;
        const scopedGraph = new Proxy(graph, {
          get(target, property) {
            if (property === "upsert") return (rawID, code, imports, options) => {
              const id = target.normalizeGraphId(rawID);
              if (code === "" && imports.length === 0 && processed.has(id)) return target.get(id);
              const result = target.upsert(rawID, code, imports, options);
              if (code !== "") processed.add(id);
              return result;
            };
            const value = Reflect.get(target, property, target);
            return typeof value === "function" ? value.bind(target) : value;
          }
        });
        return update(context, { ...dependencies, moduleGraph: scopedGraph });
      };
    };
  }
});

// bridge/vite/native-accept.cjs
var require_native_accept = __commonJS({
  "bridge/vite/native-accept.cjs"(exports2) {
    "use strict";
    exports2.registry = `
const __xplatAcceptMetadata = globalThis.__XPLAT_HMR_ACCEPT_METADATA__ ||= new WeakMap();
const __xplatInstallRegistry = installNsHotRegistry;
installNsHotRegistry = function(...args) {
  const registry = __xplatInstallRegistry(...args);
  if (registry.__xplatAcceptShapes) return registry;
  registry.__xplatAcceptShapes = true;
  const create = registry.createHotContext;
  registry.createHotContext = function(owner) {
    const context = create.call(this,owner);
    const accept = context.accept;
    context.accept = function(dependencies,callback) {
      if ((typeof dependencies !== 'string' && !Array.isArray(dependencies)) || typeof callback !== 'function') return accept.apply(this,arguments);
      const list = typeof dependencies === 'string' ? [dependencies] : dependencies;
      const keys = list.map(specifier => {
        const url = new URL(specifier,new URL(registry.canonicalHotKey(owner),'http://xplat.invalid'));
        return registry.canonicalHotKey(url.href);
      });
      const registered = (...args) => callback(...args);
      __xplatAcceptMetadata.set(registered,{keys,callback,single:typeof dependencies==='string'});
      return accept.call(this,dependencies,registered);
    };
    return context;
  };
  return registry;
};
`;
    exports2.strategy = `
import {getNsHotRegistry as __xplatRegistry} from '@nativescript/vite/hmr/client/framework.js';
const __xplatTypeScriptStrategy = {...typescriptClientStrategy};
let __xplatPendingAccepts = new Map();
let __xplatFreshModules = new Map();
typescriptClientStrategy.beforeBatchEvict = function(ids) {
  __xplatTypeScriptStrategy.beforeBatchEvict?.(ids);
  const registry = __xplatRegistry();
  __xplatPendingAccepts = new Map(ids.map(id => [registry.canonicalHotKey(id),{
    self:registry.getAcceptCallbacks(id),dependencies:registry.getDepAcceptors(id)
  }]));
  __xplatFreshModules = new Map();
  registry.runDispose(ids);
};
typescriptClientStrategy.afterModuleReimport = function(id,namespace) {
  __xplatTypeScriptStrategy.afterModuleReimport?.(id,namespace);
  __xplatFreshModules.set(__xplatRegistry().canonicalHotKey(id),namespace);
};
typescriptClientStrategy.refreshAfterBatch = async function(ids,context) {
  const registry = __xplatRegistry();
  const callbacks = new Map();
  let fullyAccepted = true;
  try {
   for (const id of ids) {
    const key = registry.canonicalHotKey(id);
    const accepted = __xplatPendingAccepts.get(key);
    const namespace = __xplatFreshModules.get(key);
    if (!accepted || !namespace || (!accepted.self.length && !accepted.dependencies.length)) { fullyAccepted=false; continue; }
    if (accepted.self.length) {
      for(const callback of accepted.self) await callback(namespace);
    } else {
      for(const acceptor of accepted.dependencies) callbacks.set(acceptor.callback,namespace);
    }
   }
   for(const [callback,namespace] of callbacks) {
    const shape = globalThis.__XPLAT_HMR_ACCEPT_METADATA__?.get(callback);
    if (shape) {
      const namespaces = shape.keys.map(key => __xplatFreshModules.get(key));
      await shape.callback(shape.single ? namespaces[0] : namespaces);
    } else await callback([namespace]);
   }
  } catch(error) {
    // The engine contains update failures. Leave a stable application log rather
    // than silently reporting success or forwarding arbitrary callback contents.
    console.error('[xplat-hmr] Native accept callback failed; update was not completed');
    throw error;
  } finally {
    __xplatPendingAccepts.clear();
    __xplatFreshModules.clear();
  }
  if (!fullyAccepted) return __xplatTypeScriptStrategy.refreshAfterBatch?.(ids,context);
  context.setUpdateOverlayStage('complete',{detail:'Accepted native module update'});
};
`;
    exports2.plugin = () => ({
      name: "xplat-native-accept-boundaries",
      enforce: "pre",
      configureServer(server) {
        server.middlewares.use((request2, response, next) => {
          const file = new URL(request2.url, "http://xplat.invalid").pathname;
          let addition, marker;
          if (file === "/ns/m/node_modules/@nativescript/vite/hmr/client/hot-context.js") {
            addition = exports2.registry;
            marker = "__xplatInstallRegistry";
          }
          if (file === "/ns/m/node_modules/@nativescript/vite/hmr/frameworks/typescript/client/strategy.js") {
            addition = exports2.strategy;
            marker = "__xplatTypeScriptStrategy";
          }
          if (!addition) return next();
          const end = response.end;
          response.end = function(chunk, encoding, callback) {
            if (this.statusCode !== 200 || this.headersSent || !String(this.getHeader("Content-Type")).includes("javascript")) return end.call(this, chunk, encoding, callback);
            const code = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk || "");
            if (code.includes(marker)) return end.call(this, chunk, encoding, callback);
            this.removeHeader("Content-Length");
            return end.call(this, Buffer.from(code + "\n" + addition), typeof encoding === "function" ? encoding : callback);
          };
          next();
        });
      },
      transform(code, id) {
        const file = id.replace(/\\/g, "/").split("?")[0];
        if (file.endsWith("/@nativescript/vite/hmr/client/hot-context.js")) return { code: code + "\n" + exports2.registry, map: null };
        if (file.endsWith("/@nativescript/vite/hmr/frameworks/typescript/client/strategy.js")) return { code: code + "\n" + exports2.strategy, map: null };
      }
    });
  }
});

// bridge/vite/native.cjs
var require_native = __commonJS({
  "bridge/vite/native.cjs"(exports2, module2) {
    "use strict";
    var fs2 = require("node:fs");
    var path2 = require("node:path");
    var { createRequire: createRequire2 } = require("node:module");
    var { pathToFileURL } = require("node:url");
    var fail = (code) => Object.assign(new Error(), { code });
    module2.exports = async function native(p, emit) {
      if (!["ios", "android"].includes(p.platform) || p.configuration !== "debug" || ![p.projectDir, p.appPath, p.directory, p.cacheDirectory, p.entry].every(path2.isAbsolute) || !Number.isInteger(p.port) || p.port < 1 || p.port > 65535 || !Array.isArray(p.nativeInputs) || !p.nativeInputs.every(path2.isAbsolute) || !Array.isArray(p.nativeSources)) throw fail("invalid_input");
      const req = createRequire2(path2.join(p.projectDir, "package.json"));
      const sourceGroups = p.nativeSourceGroups ?? [];
      if (!Array.isArray(sourceGroups) || !sourceGroups.every((g) => g && typeof g.name === "string" && path2.isAbsolute(g.path || "") && path2.isAbsolute(g.root || "") && Array.isArray(g.files) && g.files.every(path2.isAbsolute))) throw fail("invalid_input");
      const nativeChanged = require_native_inputs()(p.nativeInputs, p.nativeSources, sourceGroups, p.projectDir);
      if (sourceGroups.length) {
        try {
          if (nativeChanged()) throw fail("restart_required");
        } catch {
          throw fail("restart_required");
        }
      }
      const pkg = JSON.parse(fs2.readFileSync(path2.join(p.projectDir, "package.json"), "utf8"));
      if (typeof pkg.main !== "string" || fs2.realpathSync(path2.resolve(p.projectDir, pkg.main)) !== p.entry) throw fail("invalid_input");
      process.env.NS_VITE_DIST_DIR = p.directory;
      process.env.NS_HMR_PORT = String(p.port);
      process.env.NS_HMR_HOST = p.hmrHost || "127.0.0.1";
      process.env.NS_HTTPS = "false";
      process.env.NATIVESCRIPT_BUNDLER_ENV = JSON.stringify({ [p.platform]: true, hmr: true });
      process.argv.push("--", `--env.${p.platform}`, "--env.hmr");
      let engine, vite;
      try {
        const engineFile = req.resolve("@nativescript/vite");
        const enginePkg = JSON.parse(fs2.readFileSync(path2.join(path2.dirname(engineFile), "package.json"), "utf8"));
        if (enginePkg.version !== "8.0.21") throw fail("unavailable");
        engine = await import(pathToFileURL(req.resolve("@nativescript/vite/typescript")).href);
        vite = await import(pathToFileURL(req.resolve("vite")).href);
        if (!/^8\./.test(vite.version)) throw fail("unavailable");
        const framework = await import(pathToFileURL(req.resolve("@nativescript/vite/framework")).href);
        require_native_update()(framework);
      } catch (error) {
        throw fail(error.code === "invalid_input" ? "invalid_input" : "unavailable");
      }
      function config() {
        const result = engine.typescriptConfig({ mode: "development" }, { typeCheck: false });
        const runtime = { main: "bundle.mjs", id: p.applicationID, ...p.android ? { android: p.android } : {} };
        const metadata = {
          name: "xplat-native-runtime-manifest",
          enforce: "pre",
          resolveId(id) {
            if (id === "~/package.json") return "\0xplat-native-package";
          },
          load(id) {
            if (id === "\0xplat-native-package") return `export default ${JSON.stringify(runtime)};`;
          },
          generateBundle() {
            this.emitFile({ type: "asset", fileName: "package.json", source: JSON.stringify(runtime) });
          }
        };
        result.plugins = [metadata, require_native_accept().plugin(), ...result.plugins.flat(Infinity).filter((plugin) => plugin?.name !== "nsvite-nsconfig-as-json")];
        result.root = p.projectDir;
        result.configFile = false;
        result.cacheDir = p.cacheDirectory;
        result.logLevel = "silent";
        result.server = { ...result.server, host: "127.0.0.1", port: p.port, strictPort: true, open: false, https: void 0 };
        result.build = { ...result.build, outDir: p.directory, emptyOutDir: true, watch: null };
        return result;
      }
      let server;
      const nativeWatchers = [];
      let terminalError;
      let rejectLifetime;
      const lifetime = new Promise((_, reject) => {
        rejectLifetime = (error) => {
          terminalError = error;
          reject(error);
        };
      });
      lifetime.catch(() => {
      });
      try {
        let walk = function(dir) {
          for (const entry of fs2.readdirSync(dir, { withFileTypes: true })) {
            const file = path2.join(dir, entry.name);
            if (entry.isDirectory()) walk(file);
            else if (entry.isFile()) files.push(file);
            else throw fail("operation_failed");
          }
        };
        server = await vite.createServer(config());
        server.httpServer.on("close", () => rejectLifetime(fail("server_closed")));
        server.httpServer.on("error", rejectLifetime);
        const directories = /* @__PURE__ */ new Map();
        for (const input of p.nativeInputs) {
          const recursive = fs2.existsSync(input) && fs2.statSync(input).isDirectory();
          const dir = recursive ? input : path2.dirname(input);
          directories.set(dir, recursive || directories.get(dir) || false);
        }
        for (const group of sourceGroups) directories.set(group.root, true);
        for (const [dir, recursive] of directories) {
          if (!fs2.existsSync(dir)) continue;
          const watcher = fs2.watch(dir, { recursive }, (_event, name) => {
            const file = name && path2.resolve(dir, String(name));
            try {
              if (nativeChanged(file)) rejectLifetime(fail("restart_required"));
            } catch {
              rejectLifetime(fail("restart_required"));
            }
          });
          watcher.on("error", () => rejectLifetime(fail("restart_required")));
          nativeWatchers.push(watcher);
        }
        try {
          await server.listen();
        } catch (error) {
          if (/^Port \d+ is already in use$/.test(error.message || "")) throw fail("EADDRINUSE");
          throw error;
        }
        await vite.build(config());
        if (terminalError) throw terminalError;
        const files = [];
        walk(p.directory);
        if (!files.includes(path2.join(p.directory, "bundle.mjs"))) throw fail("operation_failed");
        emit({
          type: "ready",
          manifest: { directory: p.directory, entry: path2.join(p.directory, "bundle.mjs"), files: files.sort() },
          endpoint: { url: `http://127.0.0.1:${p.port}`, hmrURL: `ws://${p.hmrHost || "127.0.0.1"}:${p.port}/ns-hmr` }
        });
        await lifetime;
      } finally {
        for (const watcher of nativeWatchers) watcher.close();
        await server?.close();
      }
    };
  }
});

// bridge/vite/index.cjs
var require_vite = __commonJS({
  "bridge/vite/index.cjs"(exports2, module2) {
    "use strict";
    var fs2 = require("node:fs");
    var path2 = require("node:path");
    var { createRequire: createRequire2 } = require("node:module");
    var { pathToFileURL } = require("node:url");
    var fail = (code) => Object.assign(new Error(), { code });
    module2.exports = async function bundle(p, emit) {
      if (p.mode === "native") return require_native()(p, emit);
      for (const key2 of ["projectDir", "directory", "entry"]) if (!path2.isAbsolute(p[key2] || "")) throw fail("invalid_input");
      if (!["bundle", "watch"].includes(p.mode)) throw fail("invalid_input");
      const req = createRequire2(path2.join(p.projectDir, "package.json"));
      let vite;
      try {
        vite = await import(pathToFileURL(req.resolve("vite")).href);
      } catch {
        throw fail("unavailable");
      }
      if (!/^7\./.test(vite.version)) throw fail("unavailable");
      if (p.platform && (!["ios", "android"].includes(p.platform) || !path2.isAbsolute(p.appPath || "") || !["debug", "release"].includes(p.configuration))) throw fail("invalid_input");
      const runtimePackage = { main: "bundle.js", ...p.android ? { id: p.applicationID, android: p.android } : {} };
      let server, watcher;
      let latest;
      let failWatch;
      const manifest = {
        name: "xplat-emitted-manifest",
        enforce: "pre",
        resolveId(source) {
          if (p.appPath && [path2.join(p.appPath, "package.json"), "~/package.json"].includes(source)) return "\0xplat-app-package";
        },
        load(id) {
          if (id !== "\0xplat-app-package") return;
          const file = path2.join(p.appPath, "package.json");
          const pkg = { ...fs2.existsSync(file) ? JSON.parse(fs2.readFileSync(file, "utf8")) : {}, ...runtimePackage };
          return `export default ${JSON.stringify(pkg)};`;
        },
        buildStart() {
          for (const name of ["package.json", "nativescript.config.js", "nativescript.config.cjs", "nativescript.config.mjs", "nativescript.config.ts"]) {
            const file = path2.join(p.projectDir, name);
            if (fs2.existsSync(file)) this.addWatchFile(file);
          }
          const appPackage = path2.join(path2.dirname(p.entry), "package.json");
          if (fs2.existsSync(appPackage)) this.addWatchFile(appPackage);
        },
        watchChange(file) {
          if (/nativescript\.config\.|package\.json$/.test(file)) failWatch?.(fail("restart_required"));
        },
        generateBundle() {
          this.emitFile({ type: "asset", fileName: "package.json", source: JSON.stringify(runtimePackage) });
        },
        writeBundle(options, output) {
          const files = Object.keys(output).sort().map((name) => path2.join(p.directory, name));
          const entry = Object.values(output).find((file) => file.type === "chunk" && file.isEntry);
          if (!entry) throw fail("operation_failed");
          latest = { directory: p.directory, entry: path2.join(p.directory, entry.fileName), files };
          if (p.mode === "watch") emit({ type: "emitted", manifest: latest });
        }
      };
      const config = {
        root: p.projectDir,
        configFile: false,
        logLevel: "silent",
        mode: p.mode === "watch" ? "development" : "production",
        ...p.platform ? {
          resolve: { conditions: ["native", p.platform], extensions: [`.${p.platform}.ts`, `.${p.platform}.js`, ".ts", ".tsx", ".js", ".jsx", ".mjs", ".json"], alias: { "~": p.appPath } },
          // Core's native modules read these at startup; this adapter emits an ESM-derived IIFE.
          define: { "global.isIOS": String(p.platform === "ios"), "global.isAndroid": String(p.platform === "android"), "__IOS__": String(p.platform === "ios"), "__ANDROID__": String(p.platform === "android"), "__APPLE__": String(p.platform === "ios"), "__VISIONOS__": "false", "__COMMONJS__": "false", "__DEV__": String(p.configuration === "debug") }
        } : {},
        plugins: [manifest],
        build: {
          outDir: p.directory,
          emptyOutDir: false,
          minify: false,
          lib: { entry: p.entry, formats: ["iife"], name: "NativeScriptApp", fileName: () => "bundle.js" },
          watch: p.mode === "watch" ? {} : null
        }
      };
      if (p.mode === "bundle") {
        await vite.build(config);
        return latest;
      }
      try {
        if (!p.callerEndpoint) {
          server = await vite.createServer({
            root: p.projectDir,
            configFile: false,
            logLevel: "silent",
            resolve: config.resolve,
            define: config.define,
            plugins: [manifest],
            server: {
              host: "127.0.0.1",
              port: p.port || 0,
              strictPort: true,
              open: false,
              hmr: { host: p.hmrHost || "127.0.0.1", clientPort: p.hmrPort || void 0, path: "/__xplat_hmr" }
            }
          });
          try {
            await server.listen();
          } catch (error) {
            if (/^Port \d+ is already in use$/.test(error.message || "")) throw fail("EADDRINUSE");
            throw error;
          }
        }
        const address = server?.httpServer.address();
        const endpoint = p.callerEndpoint || { url: `http://127.0.0.1:${address.port}`, hmrURL: `ws://${p.hmrHost || "127.0.0.1"}:${p.hmrPort || address.port}/__xplat_hmr` };
        await new Promise(async (resolve, reject) => {
          try {
            failWatch = reject;
            server?.httpServer.on("close", () => reject(fail("server_closed")));
            server?.httpServer.on("error", reject);
            watcher = await vite.build(config);
            let ready = false;
            watcher.on("event", (event) => {
              if (event.code === "ERROR") reject(fail("operation_failed"));
              if (event.code === "END" && !ready) {
                ready = true;
                emit({ type: "ready", manifest: latest, endpoint });
              }
            });
            server?.watcher.on("change", (file) => {
              if (/nativescript\.config\.|package\.json$/.test(file)) reject(fail("restart_required"));
            });
          } catch (error) {
            reject(error);
          }
        });
      } finally {
        await watcher?.close();
        await server?.close();
      }
    };
  }
});

// bridge/resolve/core.cjs
var require_core = __commonJS({
  "bridge/resolve/core.cjs"(exports2) {
    "use strict";
    var crypto = require("node:crypto");
    var path2 = require("node:path");
    exports2.supported = (pkg, dir, read) => {
      if (pkg.name !== "@nativescript/core" || pkg.version !== "9.1.3") return false;
      const hooks = pkg.nativescript?.hooks;
      const h = Array.isArray(hooks) && hooks.length === 1 && hooks[0];
      if (!h || Object.keys(h).sort().join(",") !== "inject,name,script,type" || h.name !== "nativescript-core" || h.type !== "before-checkForChanges" || h.script !== "cli-hooks/before-checkForChanges.mjs" || h.inject !== true) return false;
      let source;
      try {
        source = read(path2.join(dir, h.script));
      } catch {
        return false;
      }
      return crypto.createHash("sha256").update(source).digest("hex") === "97baeb497a77db8909e7fd39f58dd5f3390516aadf9cb85bd30db58009c7bdd7";
    };
    exports2.inventory = (relative) => relative === "platforms/ios/native-api-usage.json" || relative === "platforms/android/native-api-usage.json" || relative.startsWith("platforms/ios/typings/") && relative.endsWith(".d.ts");
  }
});

// bridge/resolve/index.cjs
var require_resolve = __commonJS({
  "bridge/resolve/index.cjs"(exports2, module2) {
    "use strict";
    var fs2 = require("node:fs");
    var path2 = require("node:path");
    var crypto = require("node:crypto");
    var { stripTypeScriptTypes, createRequire: createRequire2 } = require("node:module");
    var coreAdapter = require_core();
    var expandNativeSources = require_native_sources();
    var swiftPackages = require_swift_packages();
    var { pathToFileURL } = require("node:url");
    var configNames = ["nativescript.config.ts", "nativescript.config.js", "nativescript.config.cjs", "nativescript.config.mjs", "nativescript.config.json"];
    var safeFailures = /* @__PURE__ */ new WeakSet();
    function fail(code, message) {
      const error = Object.assign(new Error(message), { code, safeResolve: true });
      safeFailures.add(error);
      throw error;
    }
    function object(value, label) {
      if (!value || typeof value !== "object" || Array.isArray(value)) fail("invalid_input", `${label} must be an object`);
      return value;
    }
    async function resolve({ projectDir }) {
      if (!path2.isAbsolute(projectDir || "")) fail("invalid_input", "Project directory must be absolute");
      const sources = /* @__PURE__ */ new Map(), packages = /* @__PURE__ */ new Map(), edges = [], contributions = [], nativeSourceGroups = [];
      function read(file) {
        const bytes = fs2.readFileSync(file);
        sources.set(fs2.realpathSync(file), crypto.createHash("sha256").update(bytes).digest("hex"));
        return bytes.toString("utf8");
      }
      function json(file) {
        try {
          return object(JSON.parse(read(file)), "package/config JSON");
        } catch (e) {
          if (safeFailures.has(e)) throw e;
          fail("invalid_input", "Cannot read valid package/config JSON; check the selected project and installed packages");
        }
      }
      async function config(dir, required) {
        const found = configNames.filter((name) => fs2.existsSync(path2.join(dir, name)));
        if (found.length > 1) fail("invalid_input", "Multiple NativeScript config files; retain exactly one per package");
        if (!found.length) {
          if (required) fail("invalid_input", "NativeScript config missing; create nativescript.config.js, .cjs, .mjs, .ts or .json");
          return {};
        }
        const file = path2.join(dir, found[0]);
        let value;
        try {
          const text = read(file);
          if (file.endsWith(".json")) value = JSON.parse(text);
          else if (file.endsWith(".ts")) {
            let compiler;
            for (const base of [.../* @__PURE__ */ new Set([dir, root])]) {
              const req = createRequire2(path2.join(base, "package.json"));
              for (const name of ["typescript-classic", "typescript"]) {
                let installed;
                try {
                  installed = req.resolve(name);
                } catch (e) {
                  if (e.code === "MODULE_NOT_FOUND") continue;
                  throw e;
                }
                compiler = req(installed);
                if (typeof compiler.transpileModule !== "function" || !compiler.ModuleKind) fail("unavailable", "Installed TypeScript config compiler is incompatible");
                break;
              }
              if (compiler) break;
            }
            if (!compiler && !stripTypeScriptTypes) fail("unavailable", "TypeScript config needs a project-installed TypeScript compiler or Node with stripTypeScriptTypes support (22.13 or newer); use JavaScript config on older Node");
            const code = compiler ? compiler.transpileModule(text, { fileName: file, compilerOptions: { module: compiler.ModuleKind.CommonJS } }).outputText : stripTypeScriptTypes(text, { mode: "strip" });
            const module3 = new (require("node:module")).Module(file);
            module3.filename = file;
            module3.paths = require("node:module").Module._nodeModulePaths(dir);
            if (!compiler && /\b(?:import|export)\b/.test(code)) value = await import(pathToFileURL(file).href);
            else {
              module3._compile(code, file);
              value = module3.exports;
            }
          } else value = await import(pathToFileURL(file).href);
          value = value.default ?? value;
          if (typeof value === "function") value = await value({ ...process.env });
          return object(value, "NativeScript config");
        } catch (e) {
          if (safeFailures.has(e)) throw e;
          fail("invalid_input", "NativeScript config evaluation failed; check syntax and installed config imports (no installation was attempted)");
        }
      }
      function keys(value, allowed, label) {
        object(value, label);
        for (const key2 of Object.keys(value)) if (!allowed.includes(key2)) fail("unavailable", `Unsupported ${label} field ${key2.replace(/[^a-zA-Z0-9_-]/g, "?")}; migrate it to a supported native contribution before preparing`);
      }
      function directory(dir, value, fallback) {
        if (value !== void 0 && (typeof value !== "string" || !value)) fail("invalid_input", "Config paths must be nonempty strings");
        const resolved = path2.resolve(dir, value ?? fallback);
        if (!fs2.existsSync(resolved) || !fs2.statSync(resolved).isDirectory()) fail("invalid_input", "Configured app/resources directory does not exist; create it or correct its config path");
        return fs2.realpathSync(resolved);
      }
      function collect(dir, owner, cfg2, resources, core = false) {
        keys(cfg2, ["id", "appPath", "appResourcesPath", "buildPath", "ios", "android"], "config");
        if (cfg2.ios !== void 0) keys(cfg2.ios, ["NativeSource", "SPMPackages"], "iOS config");
        if (cfg2.ios?.SPMPackages !== void 0) {
          let declared;
          try {
            declared = swiftPackages.parse(cfg2.ios.SPMPackages);
          } catch (e) {
            fail(e.code === "unavailable" ? "unavailable" : "invalid_input", "SPMPackages require named HTTPS repositories, supported version/revision requirements and library products");
          }
          const origin = configNames.map((name) => path2.join(dir, name)).find(fs2.existsSync);
          for (const spm of declared) contributions.push({ packageDirectory: owner, platform: "ios", kind: "spm-remote", path: origin, spm });
        }
        if (cfg2.ios?.NativeSource !== void 0) {
          if (dir !== root) fail("unavailable", "Plugin NativeSource declarations require a qualified canonical source contract");
          let groups;
          try {
            groups = expandNativeSources(dir, cfg2.ios.NativeSource);
          } catch (e) {
            fail(e.code === "unavailable" ? "unavailable" : "invalid_input", "NativeSource requires unique named paths matching supported ordinary iOS source/header/modulemap files");
          }
          for (const group of groups) {
            nativeSourceGroups.push({ name: group.name, path: group.pattern, root: group.base, files: [...new Set(group.files.map((f) => f.realPath))].sort() });
            for (const file of group.files) {
              read(file.realPath);
              contributions.push({ packageDirectory: owner, platform: "ios", kind: file.kind, path: file.realPath });
            }
          }
        }
        if (cfg2.android !== void 0) keys(cfg2.android, ["v8Flags", "markingMode"], "Android config");
        for (const key2 of ["v8Flags", "markingMode"]) if (cfg2.android?.[key2] !== void 0 && typeof cfg2.android[key2] !== "string") fail("invalid_input", "Android runtime settings must be strings");
        if (fs2.existsSync(path2.join(dir, "hooks"))) fail("unavailable", "Legacy package hooks are unsupported; migrate to the extension SDK before preparing");
        function walk(folder, platform) {
          if (!fs2.existsSync(folder)) return;
          if (platform === "ios") {
            const manifests = fs2.readdirSync(folder).filter((n) => n === "Package.swift" || n.endsWith(".podspec"));
            if (manifests.length) {
              const hash = (p) => {
                for (const e of fs2.readdirSync(p, { withFileTypes: true })) {
                  if ([".build", ".swiftpm"].includes(e.name)) continue;
                  const f = path2.join(p, e.name);
                  if (e.isSymbolicLink()) fail("unavailable", "Native package symlinks are unsupported");
                  if (e.isDirectory()) hash(f);
                  else read(f);
                }
              };
              hash(folder);
              if (fs2.existsSync(path2.join(folder, "Podfile"))) manifests.push("Podfile");
              for (const name of manifests.sort()) contributions.push({ packageDirectory: owner, platform, kind: name === "Package.swift" ? "spm" : "pods", path: fs2.realpathSync(path2.join(folder, name)) });
              return;
            }
          }
          for (const entry of fs2.readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
            const file = path2.join(folder, entry.name);
            if (entry.isSymbolicLink()) fail("unavailable", "Symlinks inside native contribution trees are unsupported; use a linked package root instead");
            if (core && coreAdapter.inventory(path2.relative(dir, file).split(path2.sep).join("/"))) {
              read(file);
              continue;
            }
            if (entry.isDirectory() && !/\.(framework|xcframework|xcassets|bundle)$/.test(entry.name)) {
              walk(file, platform);
              continue;
            }
            let kind;
            const ext = path2.extname(entry.name).toLowerCase();
            if (platform === "ios") {
              if (core && path2.relative(dir, file).split(path2.sep).join("/") === "platforms/ios/src/module.modulemap") kind = "configuration";
              else if (entry.name === "Podfile" || ext === ".podspec") kind = "pods";
              else if (entry.name === "Package.swift") kind = "spm";
              else if ([".swift", ".m", ".mm", ".h", ".c", ".cpp"].includes(ext)) kind = "source";
              else if ([".framework", ".xcframework", ".a"].includes(ext)) kind = "framework";
              else if ([".plist", ".xcconfig", ".entitlements"].includes(ext)) kind = "configuration";
              else if ([".xcassets", ".bundle", ".png", ".jpg", ".jpeg", ".storyboard", ".xib", ".strings", ".json"].includes(ext)) kind = "resource";
            } else {
              if ([".aar", ".jar", ".so"].includes(ext)) kind = "library";
              else if ([".java", ".kt", ".c", ".cpp", ".h"].includes(ext)) kind = "source";
              else if ([".gradle", ".properties", ".mdg"].includes(ext) || entry.name === "AndroidManifest.xml") kind = "configuration";
              else if (file.split(path2.sep).includes("res") || file.split(path2.sep).includes("assets")) kind = "resource";
            }
            if (!kind) fail("unavailable", `Unsupported ${platform} native file type; migrate or remove the unrecognized contribution before preparing`);
            const real = fs2.realpathSync(file);
            if (entry.isDirectory()) {
              const hashTree = (p) => {
                for (const e of fs2.readdirSync(p, { withFileTypes: true })) {
                  const f = path2.join(p, e.name);
                  if (e.isSymbolicLink()) fail("unavailable", "Native bundle symlinks are unsupported");
                  if (e.isDirectory()) hashTree(f);
                  else read(f);
                }
              };
              hashTree(real);
            } else read(real);
            contributions.push({ packageDirectory: owner, platform, kind, path: real });
          }
        }
        for (const platform of ["ios", "android"]) walk(path2.join(dir, "platforms", platform), platform);
        if (resources) {
          walk(path2.join(resources, "iOS"), "ios");
          walk(path2.join(resources, "Android"), "android");
        }
      }
      const root = fs2.realpathSync(projectDir);
      const app = json(path2.join(root, "package.json"));
      const cfg = await config(root, true);
      if (typeof cfg.id !== "string" || !/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(cfg.id)) fail("invalid_input", "Config id must be a dotted application identifier");
      function serializable(value) {
        if (value === null || typeof value === "string" || typeof value === "boolean") return;
        if (typeof value === "number" && Number.isFinite(value)) return;
        if (Array.isArray(value)) {
          for (const item of value) serializable(item);
          return;
        }
        if (value && Object.getPrototypeOf(value) === Object.prototype) {
          for (const item of Object.values(value)) serializable(item);
          return;
        }
        fail("unavailable", "Native config must contain finite JSON values without omitted fields");
      }
      serializable(cfg);
      if (cfg.buildPath !== void 0 && (typeof cfg.buildPath !== "string" || !cfg.buildPath)) fail("invalid_input", "Config buildPath must be a nonempty string");
      const normalized = { nativeConfig: cfg, appPath: directory(root, cfg.appPath, "app"), appResourcesPath: directory(root, cfg.appResourcesPath, "App_Resources"), android: cfg.android ?? {} };
      collect(root, root, cfg, normalized.appResourcesPath);
      async function visit(dir, pkg, isRoot = false) {
        if (packages.has(dir)) return;
        if (typeof pkg.name !== "string" || typeof pkg.version !== "string") fail("invalid_input", "Every resolved package must have a name and version");
        const native = pkg.nativescript !== void 0;
        const item = { name: pkg.name, version: pkg.version, directory: dir, native };
        packages.set(dir, item);
        if (!isRoot && native) {
          const core = pkg.name === "@nativescript/core";
          if (core && !coreAdapter.supported(pkg, dir, read)) fail("unavailable", "NativeScript core requires the reviewed 9.1.3 compatibility-hook contract");
          keys(pkg.nativescript, core ? ["platforms", "hooks"] : ["platforms"], "package nativescript metadata");
          if (pkg.nativescript.platforms) {
            keys(pkg.nativescript.platforms, ["ios", "android"], "package platforms");
            for (const v of Object.values(pkg.nativescript.platforms)) if (typeof v !== "string") fail("invalid_input", "Native platform versions must be strings");
          }
          const pluginConfig = await config(dir, false);
          for (const key2 of ["id", "appPath", "appResourcesPath"]) if (pluginConfig[key2] !== void 0) fail("unavailable", "App-only fields in plugin config are unsupported; move them to the application config");
          collect(dir, dir, pluginConfig, void 0, core);
          item.android = pluginConfig.android ?? {};
          item.iosRequirement = pkg.nativescript.platforms?.ios ?? "";
          item.androidRequirement = pkg.nativescript.platforms?.android ?? "";
        }
        for (const key2 of ["dependencies", "optionalDependencies", "peerDependencies"]) {
          if (pkg[key2] !== void 0) object(pkg[key2], key2);
        }
        const runtimes = isRoot ? Object.fromEntries(Object.entries(pkg.devDependencies || {}).filter(([name]) => ["@nativescript/ios", "@nativescript/android"].includes(name))) : {};
        const deps = { ...runtimes, ...pkg.peerDependencies, ...pkg.dependencies, ...pkg.optionalDependencies };
        for (const name of Object.keys(deps).sort()) {
          if (!/^(?:@[a-zA-Z0-9_.-]+\/)?[a-zA-Z0-9_.-]+$/.test(name)) fail("invalid_input", "Invalid dependency package name");
          const locations = require("node:module").Module._nodeModulePaths(dir);
          const file = locations.map((p) => path2.join(p, name, "package.json")).find(fs2.existsSync);
          if (!file) {
            if (Object.hasOwn(pkg.optionalDependencies || {}, name) || pkg.peerDependenciesMeta?.[name]?.optional && !Object.hasOwn(pkg.dependencies || {}, name)) continue;
            fail("unavailable", "Required dependency is not installed; install project dependencies explicitly before Resolve");
          }
          const target = fs2.realpathSync(path2.dirname(file));
          edges.push({ from: dir, name, directory: target, location: path2.dirname(file) });
          if (!packages.has(target)) await visit(target, json(file));
        }
      }
      await visit(root, app, true);
      const membership = /* @__PURE__ */ new Map();
      for (const c of contributions) {
        if (c.kind === "spm-remote") continue;
        const key2 = JSON.stringify([c.platform, c.kind, c.path]), previous = membership.get(key2);
        if (!previous || previous.packageDirectory === root && c.packageDirectory !== root || previous.packageDirectory !== root && c.packageDirectory !== root && c.packageDirectory < previous.packageDirectory) membership.set(key2, c);
      }
      let remote;
      try {
        remote = swiftPackages.merge(contributions, root);
      } catch {
        fail("invalid_input", "Conflicting Swift package repositories, identities or plugin versions; select an explicit app version for the same repository");
      }
      for (const c of remote) membership.set(JSON.stringify(["spm-remote", c.spm.repositoryURL]), c);
      const result = { directory: projectDir, applicationID: cfg.id, config: normalized, packages: [...packages.values()].sort((a, b) => a.directory.localeCompare(b.directory)), dependencies: edges, contributions: [...membership.values()], sources: [...sources].map(([path3, digest]) => ({ path: path3, digest })).sort((a, b) => a.path.localeCompare(b.path)) };
      if (nativeSourceGroups.length) result.nativeSourceGroups = nativeSourceGroups;
      result.revision = crypto.createHash("sha256").update(JSON.stringify(result)).digest("hex");
      return result;
    }
    module2.exports = async (payload) => {
      try {
        return await resolve(payload);
      } catch (error) {
        if (safeFailures.has(error)) throw error;
        fail("invalid_input", "Cannot read project resolution inputs; check config and installed native package files");
      }
    };
  }
});

// bridge/host/main.cjs
var fs = require("node:fs");
var path = require("node:path");
var { createRequire } = require("node:module");
var xcode = require_xcode();
var protocol = 1;
var payloadVersion = "0.1.0";
var registry = /* @__PURE__ */ new Map();
function register(feature, operation, handler) {
  const key2 = `${feature}/${operation}`;
  if (registry.has(key2)) throw new Error("duplicate helper operation");
  registry.set(key2, handler);
}
register("extensions", "otaStartup", require_ota());
register("xcode", "prepare", require_xcode2());
register("vite", "run", require_vite());
register("resolve", "project", require_resolve());
register("host", "info", async () => ({ protocol, payloadVersion }));
register("host", "resolveDependency", async ({ projectDir, name }) => {
  if (!path.isAbsolute(projectDir || "") || typeof name !== "string" || !name || name.startsWith(".") || path.isAbsolute(name)) {
    throw Object.assign(new Error(), { code: "invalid_input" });
  }
  return { path: createRequire(path.join(projectDir, "package.json")).resolve(name) };
});
register("editor", "roundTrip", async ({ file }) => {
  if (!path.isAbsolute(file || "")) throw Object.assign(new Error(), { code: "invalid_input" });
  const project = xcode.project(file);
  project.parseSync();
  return { text: project.writeSync() };
});
var request;
var sequence = 0;
function frame(kind, extra = {}) {
  process.stdout.write(JSON.stringify({ version: protocol, payloadVersion, id: request.id, kind, ...extra }) + "\n");
}
console.log = console.info = console.warn = console.error = () => {
};
(async () => {
  request = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  if (request.version !== protocol || request.payloadVersion !== payloadVersion) {
    frame("error", { error: { code: "version", message: "Helper version mismatch" } });
    return;
  }
  if (!request.id || !request.feature || !request.operation) throw Object.assign(new Error(), { code: "invalid_input" });
  const handler = registry.get(`${request.feature}/${request.operation}`);
  if (!handler) throw Object.assign(new Error(), { code: "unavailable" });
  frame("event", { sequence: ++sequence, payload: { stage: "started" } });
  frame("result", { payload: await handler(request.payload || {}, (payload) => frame("event", { sequence: ++sequence, payload })) });
})().catch((error) => {
  if (!request) {
    process.exitCode = 1;
    return;
  }
  frame("error", { error: { code: ["invalid_input", "unavailable", "EADDRINUSE", "server_closed", "restart_required"].includes(error.code) ? error.code : "operation_failed", message: request.feature === "resolve" && error.safeResolve ? error.message : "Helper operation failed" } });
});
