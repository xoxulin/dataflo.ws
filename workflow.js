var define;
if (typeof define === "undefined")
	define = function (classInstance) {
		classInstance (require, exports, module);
	}

define (function (require, exports, module) {

var EventEmitter = require ('events').EventEmitter,
	util         = require ('util'),
	common       = require ('./common'),
	taskClass    = require ('./task/base');

var taskStateNames = taskClass.prototype.stateNames;

var hasOwnProperty = Object.prototype.hasOwnProperty;

function isEmpty(obj) {
	
    if (obj === void 0)
		return true;
	// Assume if it has a length property with a non-zero value
    // that that property is correct.
    if (obj === true)
		return !obj;
	
	if (obj.toFixed && obj !== 0)
		return false;
	
	if (obj.length && obj.length > 0)
		return false;

    for (var key in obj) {
        if (hasOwnProperty.call(obj, key))
			return false;
    }
	
    return true;
}

function taskRequirements (requirements, dict) {
	
	var result = [];
	
	for (var k in requirements) {
		var requirement = requirements[k];
		for (var i = 0; i < requirement.length; i++) {
			try {
				if (isEmpty (common.pathToVal (dict, requirement[i])))
					result.push (k);
			} catch (e) {
				result.push (k);
			}
		}
	}
	
	return result;
}


function checkTaskParams (params, dict, prefix) {
	
	// parse task params
	// TODO: modify this function because recursive changes of parameters works dirty (indexOf for value)
	
	if (prefix == void 0) prefix = '';
	if (prefix) prefix += '.';
	
	var modifiedParams;
	var failedParams = [];
	
	if (params.constructor == Array) { // params is array
		
		modifiedParams = [];
		
		params.forEach(function (val, index, arr) {
			
			if (val.indexOf || val.interpolate) { // string				
				
				try {
					var tmp = val.interpolate (dict);
					if (tmp === void 0)
						modifiedParams.push(val);
					else
						modifiedParams.push(tmp);
						
//					console.log (val, ' interpolated to the "', modifiedParams[key], '" and ', isEmpty (modifiedParams[key]) ? ' is empty' : 'is not empty');

					if (isEmpty (modifiedParams[modifiedParams.length-1]))
						throw "EMPTY VALUE";
				} catch (e) {
					failedParams.push (prefix+'['+index+']');
				}

			} else if (val.toFixed) {
				modifiedParams.push(val);
			} else {
				var result = checkTaskParams(val, dict, prefix+'['+index+']');
				modifiedParams.push(result.modified);
				failedParams = failedParams.concat (result.failed);
			}
		});
		
	} else { // params is hash
	
		modifiedParams = {};
		
		for (var key in params) {
			var val = params[key];
			var valCheck = val;
			if ((key == '$bind' || key == 'bind') && prefix == '') {
				// bind is a real js object. it can be circular
				modifiedParams[key] = val;
			} else if (val.interpolate) { // val is string || number
				
				try {
					var tmp = modifiedParams[key] = val.interpolate (dict);
					if (tmp === void 0)
						modifiedParams[key] = val;
//					if (tmp === false || tmp === 0 || tmp === "")
						
//					console.log (val, ' interpolated to the "', modifiedParams[key], '" and ', isEmpty (modifiedParams[key]) ? ' is empty' : 'is not empty');
					if (isEmpty (modifiedParams[key]))
						throw "EMPTY VALUE";
					
				} catch (e) {
					
					failedParams.push (prefix+key);
				
				}
				
			} else if (val.toFixed) {
				modifiedParams[key] = val;
			} else { // val is hash || array
				
				var result = checkTaskParams(val, dict, prefix+key);
				
				modifiedParams[key] = result.modified;
				failedParams = failedParams.concat (result.failed);
			}
		}
	}
	
	return {
		modified: modifiedParams,
		failed: failedParams || []
	};
}

/**
 * @class workflow
 * @extends events.EventEmitter
 *
 * The heart of the framework. Parses task configurations, loads dependencies,
 * launches tasks, stores their result. When all tasks are completed,
 * notifies subscribers (inititators).
 *
 * @cfg {Object} config (required) Workflow configuration.
 * @cfg {String} config.$class (required) Class to instantiate
 * (alias of config.className).
 * @cfg {String} config.$function (required) Synchronous function to be run
 * (instead of a class). Alias of functionName.
 * @cfg {String} config.$set Path to the property in which the produced data
 * will be stored.
 * @cfg {String} config.$method Method to be run after the class instantiation.
 * @cfg {Object} reqParam (required) Workflow parameters.
 */
var workflow = module.exports = function (config, reqParam) {
	
	var self = this;
	
	util.extend (true, this, config); // this is immutable config skeleton
	util.extend (true, this, reqParam); // this is config fixup
	
	this.created = new Date().getTime();
	
	// here we make sure workflow uid generated
	// TODO: check for cpu load
	var salt = (Math.random () * 1e6).toFixed(0);
	this.id      = this.id || (this.started ^ salt) % 1e6;

	if (!this.stage) this.stage = 'workflow';

	//if (!this.stageMarkers[this.stage])
	//	console.error ('there is no such stage marker: ' + this.stage);

	var idString = ""+this.id;
	while (idString.length < 6) {idString = '0' + idString};
	this.coloredId = [
		"" + idString[0] + idString[1],
		"" + idString[2] + idString[3],
		"" + idString[4] + idString[5]
	].map (function (item) {
		try {
			var _p = process;
			return "\x1B[0;3" + (parseInt(item) % 8)  + "m" + item + "\x1B[0m";
		} catch (e) {
			return item;
		}
		
	}).join ('');

	this.data = this.data || {};
	
//	console.log ('!!!!!!!!!!!!!!!!!!!' + this.data.keys.length);
	
//	console.log ('config, reqParam', config, reqParam);
	
	self.ready = true;
	
	// TODO: optimize usage - find placeholders and check only placeholders
	
	this.tasks = config.tasks.map (function (taskParams) {
		var task;

		var checkRequirements = function () {
			
			var dict = util.extend(true, {}, reqParam);
			dict.data = self.data;
			
			if ($isServerSide) {
				dict.project = project
			}
			
			var result = checkTaskParams (taskParams, dict);
			
			if (result.failed && result.failed.length > 0) {
				this.unsatisfiedRequirements = result.failed;
				return false;
			} else if (result.modified) {
				util.extend (this, result.modified);
				return true;
			}
		}
		
		// check for data persistence in self.templates[taskTemplateName], taskParams
		var taskTemplateName = taskParams.$template;
		if (self.templates && self.templates[taskTemplateName]) {
			taskParams = util.extend(true, self.templates[taskTemplateName], taskParams);
			delete taskParams.$template;
		}
		
//		console.log (taskParams);
		
		var taskClassName = taskParams.className || taskParams.$class;
		var taskFnName = taskParams.functionName || taskParams.$function;
		
		if (taskClassName && taskFnName)
			self.logError ('defined both className and functionName, using className');
		
		if (taskClassName) {
//			self.log (taskParams.className + ': initializing task from class');
			var xTaskClass;
			
			// TODO: need check all task classes, because some compile errors may be there
//			console.log ('task/'+taskParams.className);
			try {
				xTaskClass = require (taskClassName);
			} catch (e) {
				console.log ('require '+taskClassName+':', e);
				self.ready = false;
				return;
			}
			
			task = new xTaskClass ({
				className: taskClassName,
				method:    taskParams.method || taskParams.$method,
				require:   checkRequirements,
				important: taskParams.important || taskParams.$important
			});
		} else if (taskParams.coderef || taskFnName) {
		
//			self.log ((taskParams.functionName || taskParams.logTitle) + ': initializing task from function');
			if (!taskFnName && !taskParams.logTitle)
				throw "task must have a logTitle when using call parameter";
			
			var xTaskClass = function (config) {
				this.init (config);
			};

			util.inherits (xTaskClass, taskClass);

			util.extend (xTaskClass.prototype, {
				run: function () {
					var failed = false;
					if ((taskParams.$bind || taskParams.bind) && taskFnName) {
						try {
							var functionRef = taskParams.bind || taskParams.$bind;
							// TODO: use pathToVal
							var fSplit = taskFnName.split (".");
							while (fSplit.length) {
								var fChunk = fSplit.shift();
								functionRef = functionRef[fChunk];
							}
							
							this.completed (functionRef.call (taskParams.bind || taskParams.$bind, this));
						} catch (e) {
							failed = 'failed call function "'+taskFnName+'" from ' + (taskParams.bind || taskParams.$bind) + ' with ' + e;
						}
					} else if (taskFnName) {
						var fn = $mainModule[taskFnName];
						if (fn && fn.constructor == Function) {
							this.completed (fn (this));
						} else {
							// this is solution for nodejs scope:
							// exports can be redefined
							var mainExports = eval ($scope);
							var fn = mainExports[taskFnName];
							if (fn && fn.constructor == Function) {
								$mainModule = mainExports;
								this.completed (fn (this));
							} else {
								// TODO: fix description for window
								failed = "you defined functionName as " + taskFnName
								+ " but we cannot find this name in current scope (" + $scope
								+ ").\nplease add " + ($isClientSide ? "'window." : "'module.exports.")
								+ taskFnName + " = function (params) {...}}' in your main module";
							}
						}
					} else {
						// TODO: detailed error description
//						if (taskParams.bind)
						this.completed (taskParams.coderef (this));
					}
					if (failed) throw failed;
				}
			});
			
			task = new xTaskClass ({
				functionName: taskFnName,
				logTitle:     taskParams.logTitle || taskParams.$logTitle,
				require:      checkRequirements,
				important:    taskParams.important || taskParams.$important
			});
			
		}
		
//		console.log (task);
		
		return task;
	});
	
};

util.inherits (workflow, EventEmitter);

function pad(n) {
	return n < 10 ? '0' + n.toString(10) : n.toString(10);
}

// one second low resolution timer
$stash.currentDate = new Date ();
$stash.currentDateInterval = setInterval (function () {
	$stash.currentDate = new Date ();
}, 1000);

function timestamp () {
	var time = [
		pad($stash.currentDate.getHours()),
		pad($stash.currentDate.getMinutes()),
		pad($stash.currentDate.getSeconds())
	].join(':');
	var date = [
		$stash.currentDate.getFullYear(),
		pad($stash.currentDate.getMonth() + 1),
		pad($stash.currentDate.getDate())
	].join ('-');
	return [date, time].join(' ');
}


util.extend (workflow.prototype, {
	checkTaskParams: checkTaskParams,
	taskRequirements: taskRequirements,
	isIdle: true,
	haveCompletedTasks: false,
		
	/**
	 * @method run Initiators call this method to launch the workflow.
	 */
	run: function () {
		if (!this.started)
			this.started = new Date().getTime();
		
		var self = this;
		
		if (self.stopped)
			return;
		
		self.failed = false;
		self.isIdle = false;
		self.haveCompletedTasks = false;
				
//		self.log ('workflow run');
		
		this.taskStates = [0, 0, 0, 0, 0, 0, 0];
		
		// check task states
		
		this.tasks.map (function (task) {
			
			if (task.subscribed === void(0)) {
				self.addEventListenersToTask (task);
			}
			
			task.checkState ();
			
			self.taskStates[task.state]++;
			
//			console.log ('task.className, task.state\n', task, task.state, task.isReady ());
			
			if (task.isReady ()) {
				self.logTask (task, 'started');
				task.run ();
				
				// sync task support
				if (!task.isReady()) {
					self.taskStates[task.stateNames.ready]--;
					self.taskStates[task.state]++;
				}
			}
		});

		var taskStateNames = taskClass.prototype.stateNames;
		
		if (this.taskStates[taskStateNames.ready] || this.taskStates[taskStateNames.running]) {
			// it is save to continue, wait for running/ready task
			console.log ('have running tasks');
			
			self.isIdle = true;
			
			return;
		} else if (self.haveCompletedTasks) {
			console.log ('have completed tasks');
			// stack will be happy
			if ($isClientSide) {
				setTimeout (function () {self.run ();}, 0);
			} else if ($isServerSide) {
				process.nextTick (function () {self.run ()});
			}
			
			self.isIdle = true;
			
			return;
		}
		
		self.stopped = new Date().getTime();
		
		var scarceTaskMessage = 'unsatisfied requirements: ';
	
		// TODO: display scarce tasks unsatisfied requirements
		if (this.taskStates[taskStateNames.scarce]) {
			self.tasks.map (function (task) {
				if (task.state != taskStateNames.scarce && task.state != taskStateNames.skipped)
					return;
				if (task.important) {
					task.failed ("important task didn't started");
					self.taskStates[taskStateNames.scarce]--;
					self.taskStates[task.state]++;
					self.failed = true;
					scarceTaskMessage += '(important)';
				}
				
				if (task.state == taskStateNames.scarce)
					scarceTaskMessage += (task.logTitle) + ' => ' + task.unsatisfiedRequirements.join (', ') + '; ';
			});
			self.log (scarceTaskMessage);
		}

		if (self.verbose) {
			var requestDump = '???';
			try {
				requestDump = JSON.stringify (self.request)
			} catch (e) {
				if ((""+e).match (/circular/))
					requestDump = 'CIRCULAR'
				else
					requestDump = e
			};
		}
		
		if (this.failed) {
			// workflow stopped and failed
		
			self.emit ('failed', self);
			self.log (this.stage + ' failed in ' + (self.stopped - self.started) + 'ms; ' + this.taskStates[taskStateNames.failed]+' tasks of ' + self.tasks.length);

		} else {
			// workflow stopped and not failed
		
			self.emit ('completed', self);
			self.log (this.stage + ' complete in ' + (self.stopped - self.started) + 'ms');

		}
		
		self.isIdle = true;
		
	},
	stageMarker: {prepare: "()", workflow: "[]", presentation: "<>"},
	log: function (msg) {
//		if (this.quiet || process.quiet) return;
		var toLog = [
			timestamp (),
			this.stageMarker[this.stage][0] + this.coloredId + this.stageMarker[this.stage][1]
		];
		for (var i = 0, len = arguments.length; i < len; ++i) {
			toLog.push (arguments[i]);
		}
		
		// TODO: also check for bad clients (like ie9)
		if ($isPhoneGap) {
			toLog.shift();
			toLog = [toLog.join (' ')];
		}
		
		console.log.apply (console, toLog);
	},
	logTask: function (task, msg) {
		this.log (task.logTitle,  "("+task.state+")",  msg);
	},
	logTaskError: function (task, msg, options) {
		// TODO: fix by using console.error
		this.log(task.logTitle, "("+task.state+") \x1B[0;31m" + msg, options || '', "\x1B[0m");
	},
	logError: function (task, msg, options) {
		// TODO: fix by using console.error
		this.log(" \x1B[0;31m" + msg, options || '', "\x1B[0m");
	},
	addEventListenersToTask: function (task) {
		var self = this;
		
		task.subscribed = 1;
		
		// loggers
		task.on ('log', function (message) {
			self.logTask (task, message); 
		});

		task.on ('warn', function (message) {
			self.logTaskError (task, message); 
		});
		
		task.on ('error', function (e) {
			self.error = e;
			self.logTaskError (task, 'error: ', e);// + '\n' + arguments[0].stack);
		});

		// states
		task.on ('skip', function () {
//			if (task.important) {
//				self.failed = true;
//				return self.logTaskError (task, 'error ' + arguments[0]);// + '\n' + arguments[0].stack);
//			}
			self.logTask (task, 'task skipped');
			
			if (self.isIdle)
				self.run ();
			
		});
		
		task.on ('cancel', function () {
			
			self.logTaskError (task, 'canceled, retries = ' + task.retries);
			self.failed = true;
			
			if (self.isIdle)
				self.run ();
		});
		
		task.on ('complete', function (t, result) {
			
			if (result) {
				if (t.produce || t.$set) {
					common.pathToVal (self, t.produce || t.$set, result);
				} else if (t.$mergeWith) {
					common.pathToVal (self, t.$mergeWith, result, common.mergeObjects);
				}
			}
			
			self.logTask (task, 'task completed');
			
			if (self.isIdle)
				self.run ();
			else
				self.haveCompletedTasks = true;
		});

	}
});

});

