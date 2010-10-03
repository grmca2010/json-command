var sys = require("sys"),
    Script  = process.binding("evals").Script;

/*
 JSON Command class 
*/

JSON.Command = function(args) {
  this.args = null;

  this.debugOn = false;
  this.fileNames = [];
  this.files = null;
  this.keys = [];
  this.transformedKeys = [];
  this.uglyOutput = false;
  this.columnOutput = false;
  this.useObject = null;

  this.conditionals = [];
  this.executables = [];

  this.stdin = null;
  this.buffer = "";
  this.scriptObject;

  if (args) { this.processArgs(args); }
};

JSON.Command.prototype.stringify = function(obj) {
  return(this.uglyOutput ? JSON.stringify(obj) : JSON.stringify(obj, null, 2));
};

JSON.Command.prototype.debug = function(msg) {
  if (this.debugOn) { sys.puts(msg); }
};

JSON.Command.prototype.printex = function(ex) {
  this.debug("ex: " + JSON.stringify(ex, null, 2));
};

/*
  Process Command line arguments to JSON Command
*/

JSON.Command.prototype.processArgs = function processArgs(args) {

  // copy argv to chop it up
  var a = args.slice(0); 

  while (a.length > 0) {
    var arg = a.shift();
    switch(arg) {
      case "-f": // file
        this.fileNames.push(a.shift());
        break;
      case "-d": // debug
        this.debugOn = true;
        break;
      case "-u": // pretty printing (turn off)
        this.uglyOutput = true;
        break;
      case "-c": // conditional
        this.conditionals.push(a.shift());
        break;
      case "-C": // column output
        this.columnOutput = true;
        break;
      case "-e": // executable (transform data)
        this.executables.push(a.shift());
        break;
      case "-o": // use object
        this.useObject = a.shift();
        break;
      // json object keys
      default:
        if (arg.match("=")) {
          var kk = arg.split("=");
          this.keys.push(kk[0]);
          this.transformedKeys.push({ 
            newKey : kk[0],
            oldKey : kk[1]
          });
        }
        else {
          this.keys.push(arg);
        }
        break;
    } 
  }
};

/*
  Create any reuested keys that don't already exist. Init values with null.
   The default value could be an option.
*/

JSON.Command.prototype.createRequestedKeys = function(parsedObject) {
  // instantiate any requested keys
  for(var j = 0; (j < this.keys.length); j++) {
    if (!parsedObject[this.keys[j]]) {
      parsedObject[this.keys[j]] = null;
    }
  }
};

/*
  Check conditionals against object.
*/

JSON.Command.prototype.checkConditionals = function(parsedObject) {
  if (this.conditionals.length) {
    try {
      var conditionsFailed = false;
      for(var i = 0; (i < this.conditionals.length); i++) {
        this.scriptObject = new Script("(" + this.conditionals[i] + ")");
        if (!this.scriptObject.runInNewContext(parsedObject)) { 
          conditionsFailed = true; 
        }
      }
      // if any conditions failed return false
      if (conditionsFailed) { return false; }
    }
    catch(ex) {
      // if any conditional fails, return false,
      //  the conditional may access something not present, etc..
      this.printex(ex);
      return false;
    }
  }
  // all conditionals passed
  return true;
};

/*
  Process key transforms against object.
*/

JSON.Command.prototype.processKeyTransforms = function(parsedObject) {
  if (this.transformedKeys.length) {
    for(var i = 0; (i < this.transformedKeys.length); i++) {
      try { 
        this.scriptObject = new Script(this.transformedKeys[i].newKey +
          " = " + this.transformedKeys[i].oldKey );
        this.scriptObject.runInNewContext(parsedObject);
      }
      catch (ex) {
        this.printex(ex);
      }
    }
  }
};

/*
  Process executables against object.
*/

JSON.Command.prototype.processExecutables = function(parsedObject) {
  if (this.executables.length) {
    for(var i = 0; (i < this.executables.length); i++) {
      try { 
        // create a new script object for the executable
        this.scriptObject = new Script(this.executables[i]);
        // run the new script in the context of the parsed object
        this.scriptObject.runInNewContext(parsedObject);
      }
      catch (ex) {
        // stop catstrophic failure if any executable fails.
        //  TODO: this may not be the desired behavior.
        this.printex(ex);
      }
    }
  }
};

/*
  Process requested keys against parsedObject.
   This may be one of the most complicated parts of this code, and it may
   very well not need to be. If you have a better idea of how to do this
   please let me know: zpoley@gmail.com.

   What's happening here is:
    1. Create a new object to replace the old one since we don't want all
     the keys from the old object.
    2. Create each object necessary in the chain in order for the resulting
     object to retain the same structure of the parsedObject.
    3. Assign each requested key value from the parsedObject into the new 
     object.

*/

JSON.Command.prototype.processKeys = function(parsedObject) {
  if (this.keys.length) {
    var hsh = {}, cols = [];
    for (var i = 0; (i < this.keys.length); i++) {
      try { 
        if (this.keys[i].match(".")) {
          // create any keys that don't exist in the object chain
          var s = this.keys[i].split(".");
          for (var j = 1; (j < s.length); j++) {
            // create necessary keys
            var evalStr = "hsh." + s.slice(0,j).join(".");
            if (!eval(evalStr)) {
              eval("hsh." + s.slice(0,j).join(".") + " = {};");
            }
          }
          var evalStr = "hsh." + s.join(".") + " = " + "parsedObject." + s.join(".");
          eval(evalStr);
          cols.push(eval("parsedObject." + s.join(".")));
        }
        else {
          hsh[keys[i]] = parsedObject[keys[i]];
          cols.push(parsedObject[keys[i]]);
        }
      }
      catch(ex) {
        this.debug("Failed to read property " + this.keys[i] + " from object: " + JSON.stringify(parsedObject));
        ex.message = "Failed to read property";
        throw ex;
      }
    }
    return this.columnOutput ? cols : hsh;
  }
  else {
    return parsedObject;
  }
};

/*
  Process input objects.
*/

JSON.Command.prototype.processObjects = function(objects) {

  var rawObject = null, parsedObject = null;

  try {
    if (this.useObject && objects && objects.length > 0) {
      this.scriptObject = new Script(this.useObject);
      objects = this.scriptObject.runInNewContext(JSON.parse(objects[0]));
    }
  }
  catch(ex) {
    this.printex(ex);
  }

  try { 
    for (var i = 0; (i < (objects.length)); i++) {
      // if there's no object, there's nothing to do 
      //  (null object is not the same as string null)
      if ((objects[i] == null) || (objects[i] == undefined)) { continue; }

      try {
        if (typeof(objects[i]) == "string") {
          rawObject = objects[i];
          parsedObject = JSON.parse(rawObject);
        }
        else {
          rawObject = JSON.stringify(objects[i]);
          parsedObject = objects[i];
        }
      } catch(ex) {
        // discard bad records
        this.printex(ex); 
        continue;
      }

      // create any requested keys that are missing
      this.createRequestedKeys(parsedObject);

      // process key transformations  on this parsedObject
      this.processKeyTransforms(parsedObject);

      // process executables on this parsedObject
      this.processExecutables(parsedObject);

      // continue if any conditionals fail on this parsedObject
      if (!this.checkConditionals(parsedObject)) {
        continue; 
      }

      try {
        // process requested keys on the parsed object
        outputObject = this.processKeys(parsedObject);
      }
      catch(ex) { continue; }

      // finally, print output
      if (this.columnOutput) {
        process.stdout.write(outputObject.join("\t") + "\n");
      }
      else {
        process.stdout.write(this.stringify(outputObject) + "\n");
      }
    }
  }
  catch(ex) {
    this.printex(ex);
  }
};

/*
  Process input.
*/

JSON.Command.prototype.processInput = function() {
  if (this.files) {
    // TODO: implement file support?
  }
  else {
    this.stdin = process.openStdin();
    this.stdin.setEncoding("utf8");
    this.stdin.jsonC = this; // context for closure

    this.stdin.on("data", function(chunk) {
      this.jsonC.buffer += chunk;
      var objects = null;
      if (this.jsonC.buffer.match(/\n/g) || 
          this.jsonC.buffer.match(/\r\n/g) || 
          this.jsonC.buffer.match(/\0/g) || 
          this.jsonC.buffer.match("}{")) {
        if (this.jsonC.buffer.match(/\n/g)) {
          objects = this.jsonC.buffer.split("\n");
        }
        if (this.jsonC.buffer.match(/\r\n/g)) {
          objects = this.jsonC.buffer.split("\r\n");
        }
        if (this.jsonC.buffer.match(/\0/g)) {
          objects = this.jsonC.buffer.split("\0");
        }
        if (this.jsonC.buffer.match("}{")) {
          objects = this.jsonC.buffer.split("}{").join("}\n{").split("\n");
        }
        this.jsonC.buffer = objects.pop();
        this.jsonC.processObjects(objects);
      }
    });

    this.stdin.on("end", function() {
      this.jsonC.processObjects([this.jsonC.buffer, null]);
    });
  }
};

