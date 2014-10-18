/* ========================================================================
* Phonon: navigator.js v0.3.9
* http://phonon.quarkdev.com
* ========================================================================
* Licensed under MIT (http://phonon.quarkdev.com)
* ======================================================================== */
(function (window, document) {

    'use strict';

    /**
     * "Encapsulated" class
     * The activity takes care of creating a window for you in which you can place your UI with.
     * An activity is based on several window states that we call the activitiy life cycle.
    */
    var Activity = (function () {

        /**
         * @constructor
        */
        function Activity() {
            this._isCreated = false;
        }
        Activity.prototype.isCreated = function () {
            return this._isCreated;
        };

        /**
         * When the page route is called for the first time
         * @param {Function} callback
        */
        Activity.prototype.onCreate = function (callback) {
            var _self = this;
            this.onCreateCallback = function (self, elPage, params) {
                _self._isCreated = true;
                callback(self, elPage, params);
            };
        };

        /**
         * onReady is called after onCreate and for each page refresh (optional)
         * @param {Function} callback
        */
        Activity.prototype.onReady = function (callback) {
            this.onReadyCallback = function (self, elPage, params) {
                callback(self, elPage, params);
            };
        };

        /**
         * Called when the user leaves the page
         * @param {Function} callback
        */
        Activity.prototype.onQuit = function (callback) {
            this.onQuitCallback = function (self) {
                callback(self);
            };
        };

        /**
         * Called when the page is completely hidden
         * @param {Function} callback
        */
        Activity.prototype.onHidden = function (callback) {
            this.onHidenCallback = function (el) {
                callback(el);
            };
        };

        /**
         * Called when the page transition is finished
         * @param {Function} callback
        */
        Activity.prototype.onTransitionEnd = function (callback) {
            this.onTransitionEndCallback = function () {
                callback();
            };
        };
        return Activity;
    })();

    var isStarted = false;
    var pages = [];
    var pageHistory = [];
    var _templatePath;
    var onTransition = false;

    var currentPageObject;
    var previousPageObject;

    var currentPageEl;
    var previousPageEl;

    var _message = null;
    var waitOnQuit = false;
    var backNavigation = false;
    var defaultPage;

    var transitionEnd = 'webkitTransitionEnd';
    var isCordova = typeof window.cordova !== 'undefined' ? true : false;

    // fix: Firefox support + android 4
    if (!('webkitTransitionEnd' in window) && !isCordova) {
        transitionEnd = 'transitionend';
    }

    /**
     * Add a page inside the page array
     * @param {Object} pageObject
     * @param {Function} pageCallback
     * @param {String} pageRoute
     * @private
    */
    var pushNewPage = function (pageObject, pageCallback, pageRoute) {
        var page = { name: pageObject.page, template: pageObject.template, asynchronous: pageObject.asynchronous, route: pageRoute, callback: pageCallback };

        if (pageRoute === undefined) {
            page.route = pageObject.page;
        }

        // Append page to pages collection
        pages.push(page);
    };

    /**
     * Returns the page object
     * @param {String} pageName
     * @return {Object}
     * @private
    */
    var getPageObject = function (pageName) {
        var i, l = pages.length - 1;
        for (i = l; i >= 0; i--) {
            var p = pages[i];
            if (p.name === pageName) {
                return p;
            }
        }
        return undefined;
    };

    /**
     * Checks if the route is matching with the url
     * @param {String} url
     * @param {String} route
     * @return {boolean|Object} False id does not match else return capture
     * @private
    */
    var matchRoute = function (url, route) {
        var routeMatch = new RegExp(route.regex).exec(url);

        if (routeMatch === null) {
            return false;
        }

        var params = {};
        for (var k in route.groups) {
            params[k] = routeMatch[route.groups[k] + 1];
        }
        return params;
    };

    /**
     * Parses the route pattern to return an object with regex and match groups
     * @param {String} route the route pattern to transform in regex
     * @return {Route} a route with regex and groups
     * @private
    */
    var parseRoute = function (route) {
        var nameRegexp = new RegExp(':([^/.\\\\]+)', 'g');
        var routeRegex = route;
        var groups = {};
        var matches = null;
        var i = 0;

        for (; matches = nameRegexp.exec(route);) {
            groups[matches[1]] = i++;
            routeRegex = routeRegex.replace(matches[0], '([^/.\\\\]+)');
        }

        routeRegex += '$'; // Only do a full string match
        return { 'groups': groups, 'regex': routeRegex };
    };

    /**
     * Checks each route with the current hash and calls the load function if the route is matching
    */
    var matchRoutes = function () {
        var hash = window.location.hash.substr(2), i, l = pages.length;
        for (i = l - 1; i >= 0; i--) {
            var page = pages[i];

            if (page.name === (hash.substring(0, hash.indexOf('/')) || hash)) {
                if (page.name !== page.route) {
                    var res = matchRoute(hash, parseRoute(page.route));
                    load(page.name, res);
                } else {
                    load(page.name);
                }
                break;
            }
        }
    };

    /**
     * Sets the path where templates are stored
     * @param {String} path
    */
    var setTemplatePath = function (path) {
        if (typeof path !== 'string') {
            throw new TypeError('path must be a string');
        }

        if (!(path.indexOf('/', path.length - '/'.length) !== -1)) {
            path = path + '/';
        }
        _templatePath = path;
    };

    /**
    * Retrieves the HTML template
    *
    * @param: {String} filename
    * @param: {Function} callback
    */
    var getTemplate = function (filename, callback) {
        var xhr = new XMLHttpRequest();

        var path = (_templatePath === undefined ? filename : _templatePath + filename);

        xhr.open('GET', path + '.html', true);
        xhr.overrideMimeType('text/html; charset=utf-8');

        xhr.onreadystatechange = function () {
            if (xhr.readyState == 4) {
                if (xhr.status == 200) {
                    // Success
                    callback(xhr.responseText);
                } else {
                    console.error('The template file could not be loaded, please check that the file exists');
                    return;
                }
            }
        };
        xhr.send();
    };

    /**
     * Event listener for the navigation buttons
     * @param {Event} evt
     * @private
    */
    var onNavigation = function (evt) {
        var hasHref = null;

        var target = evt.target ? evt.target : evt.toElement;
        for (; target && target !== document; target = target.parentNode) {
            var dataTarget = target.getAttribute('data-navigation');

            if (dataTarget !== null) {
                if (dataTarget === '$previous-page') {
                    backNavigation = true;
                    hasHref = getStackPreviousPage();
                    if ((hasHref.indexOf('#!') !== 0)) {
                        hasHref = '#!' + hasHref;
                    }
                    break;
                }
                if ((dataTarget.indexOf('#!') !== 0) && dataTarget !== '$previous-page') {
                    hasHref = '#!' + dataTarget;
                    break;
                }
            }

            if (target.attributes.href !== undefined && target.attributes.href.value !== null) {
                if (!(target.attributes.href.value.indexOf('#!') !== 0)) {
                    // page target
                    hasHref = target.attributes.href.value;
                    break;
                }
            }
        }

        if (hasHref) {
            if (currentPageObject.activity !== undefined && currentPageObject.activity.onQuitCallback !== undefined) {
                dispatchQuitCallback();
            } else {
                window.location.hash = hasHref;
            }
        }
        hasHref = null;
    };

    /**
     * Back-button event listener (Phonegap) for the navigation history
    */
    var onBackButton = function () {

        if(defaultPage !== currentPageObject.name && !waitOnQuit) {
            waitOnQuit = true;
            backNavigation = true;

            if (currentPageObject.activity !== undefined && currentPageObject.activity.onQuitCallback !== undefined) {
                dispatchQuitCallback();
            } else {
                quit();
            }
        }
    };

    /**
     * Retrieves all the anchors and buttons that have the data-autotext attribute
     * and sets the previous pagename
     * @param {String} elPage
     * @private
    */
    var setAutotext = function (elPage) {
        var anchors = elPage.querySelectorAll('a, button'), size = anchors.length - 1, i = size;

        for (; i >= 0; i--) {
            var elLink = anchors[i];

            // If autotext, rename button with previous page name
            var autotext = elLink.getAttribute('data-autotext');
            if (autotext) {
                if(!('textContent' in elLink)) {
                    elLink.innerText = previousPageObject.name;
                } else {
                    elLink.textContent = previousPageObject.name;
                }
            }
        }
    };

    /**
     * Calls the page activities
     * @param {DOMElement} elPage
     * @param {String} pageName
     * @param {String} params
     * @private
    */
    var callFronCallback = function (elPage, pageObject, params) {
        /*
        * the activity object is available from the general page scope
        * But according the different states, the methods availability change in the state callbacks
        * For example, the method "quit" is not available in the OnCreate callback
        */
        // Page Scope Callback is called once
        if (pageObject.callback !== undefined) {
            pageObject.callback(pageObject.activity);
        }

        if (pageObject.activity !== undefined && pageObject.activity.onCreateCallback !== undefined) {
            pageObject.activity.onCreateCallback({ runReady: runReady, getMessage: getMessage }, elPage, params);
        }
        if (pageObject.activity !== undefined && pageObject.activity.onReadyCallback !== undefined && pageObject.asynchronous === false) {
            setTimeout(function() {
                pageObject.activity.onReadyCallback({ startTransition: startTransition, getMessage: getMessage }, elPage, params);
            }, 50);
        }
    };

    /**
     * Dispatches the page activities
     * @param {DOMElement} elPage
     * @param {Object} pageObject
     * @param {String} params
     * @private
    */
    var dispatchFrontCallbacks = function (elPage, pageObject, params) {
        if (pageObject === undefined) {
            return;
        }

        var isCreated = pageObject.hasOwnProperty('activity');

        if (!isCreated) {
            pageObject.activity = new Activity();

            if (pageObject.template !== undefined) {
                getTemplate(pageObject.template, function (template) {
                    elPage.innerHTML = template;

                    setAutotext(elPage);
                    callFronCallback(elPage, pageObject, params);
                });
            } else {
                setAutotext(elPage);
                callFronCallback(elPage, pageObject, params);
            }
        } else {
            if (pageObject.activity !== undefined && pageObject.activity.onReadyCallback !== undefined) {
                pageObject.activity.onReadyCallback({ startTransition: startTransition, getMessage: getMessage }, elPage, params);
            }
        }
    };

    /**
     * Dispatches the transition end callback (OnTransitionEnd)
     * @private
    */
    var dispatchTransitionEndCallback = function (elPage, pageObject) {
        if (pageObject === undefined) {
            return;
        }

        // Call "onTransitionEnd" callback if exists
        if (pageObject.activity !== undefined && pageObject.activity.onTransitionEndCallback !== undefined) {
            pageObject.activity.onTransitionEndCallback();
        }
    };

    /**
     * Dispatches the onHidden callback
     * @private
    */
    var dispatchHiddenCallback = function (elPage, pageObject) {
        if (pageObject === undefined) {
            return;
        }

        // Previous req to call "OnHidden" if exists
        if (pageObject.activity !== undefined && pageObject.activity.onHidenCallback !== undefined) {
            pageObject.activity.onHidenCallback(elPage);
        }

        _message = null;
    };

    /**
     * Dispatches the onQuit callback
     * @private
    */
    var dispatchQuitCallback = function () {
        currentPageObject.activity.onQuitCallback({ quit: quit, cancel: cancelQuit });
    };

    /**
     * Retrieves the previous page according the page history 
     * @return: the previous page
     * @private
    */
    function getStackPreviousPage () {
        if(currentPageObject) {
            var i = pageHistory.indexOf(currentPageObject.name), prevPage = getPageObject(pageHistory[i-1]);
            if(prevPage) {
                return prevPage.name;
            } else {
                return previousPageObject.name;
            }
        } else {
            return previousPageObject.name;
        }
    }

    function forwardAnimation() {
        // Remove page content classes
        this.classList.remove('page-sliding');
        this.classList.remove('left');

        // Toggle visibility
        previousPageEl.classList.remove('app-active');

        dispatchHiddenCallback(previousPageEl, previousPageObject);
        dispatchTransitionEndCallback(currentPageEl, currentPageObject);

        onTransition = false;

        this.removeEventListener(transitionEnd, forwardAnimation, false);
    }

    function backAnimation() {
        // Remove page content classes
        this.classList.remove('page-sliding');
        this.classList.remove('right');

        // Toggle visibility
        previousPageEl.classList.remove('app-active');

        dispatchHiddenCallback(previousPageEl, previousPageObject);
        dispatchTransitionEndCallback(currentPageEl, currentPageObject);

        onTransition = false;

        this.removeEventListener(transitionEnd, backAnimation, false);
    }

    /**
     * Loads a page
     * @param {String} pageName
     * @param {Object} param (optional)
     * @private
    */
    function load(pageName, params) {
        onTransition = true;
        waitOnQuit = false;

        pageHistory.push(pageName);

        if(currentPageObject) {
            previousPageObject = currentPageObject;
            previousPageEl = document.getElementById(currentPageObject.name);
        }

        currentPageObject = getPageObject(pageName);
        currentPageEl = document.getElementById(currentPageObject.name);

        if(!currentPageObject) {
            throw new Error(pageName + ' does not have a namespace, please use Navigator.on() function');
        }

        if(defaultPage === currentPageObject.name && pageHistory.length > 1) {
            backNavigation = true;
            // Reset history
            pageHistory = [defaultPage];
        }

        // init & start functions add the same page
        if (previousPageObject && previousPageObject.name === currentPageObject.name) {
            onTransition = false;
            return;
        }

        // Scroll to top
        var currentContent = currentPageEl.querySelector('.content');
        if (currentContent !== null && currentContent.scrollTop !== 0) {
            currentContent.scrollTop = 0;
        }

        // Dispatch onCreate / onReady if they exist in the page scope
        dispatchFrontCallbacks(currentPageEl, currentPageObject, params);

        if (!currentPageObject.asynchronous) {
            startTransition();
        }
    }


    /**
     * Starts the page transition
     * @public
    */
    function startTransition() {
        if (previousPageObject === undefined || previousPageObject.name === currentPageObject.name) {
            onTransition = false;
            return;
        }

        // Show current page : apply a different transition according the state (back, forward)
        if (backNavigation) {
            previousPageEl.classList.add('page-sliding');
            previousPageEl.classList.add('right');

            currentPageEl.classList.add('app-active');
            previousPageEl.addEventListener(transitionEnd, backAnimation, false);
        } else {
            previousPageEl.classList.add('page-sliding');
            previousPageEl.classList.add('left');

            currentPageEl.classList.add('app-active');
            previousPageEl.addEventListener(transitionEnd, forwardAnimation, false);
        }
        backNavigation = false;
    }

    /**
     * Calls the onReady callback asynchronously
    */
    function runReady() {
        if (currentPageObject.activity !== undefined && currentPageObject.activity.onReadyCallback !== undefined) {
            var el = document.getElementById(currentPageObject.name), hash = location.hash.substr(2);
            var routeRegex = parseRoute(currentPageObject.route);
            var params = matchRoute(hash, routeRegex);

            currentPageObject.activity.onReadyCallback({ startTransition: startTransition, getMessage: getMessage }, el, params);
        }
    }

    /**
     * Quits the current activity
    */
    function quit() {
        changePage(getStackPreviousPage());
    }

    /**
     * Cancels the activity end
    */
    function cancelQuit() {
        waitOnQuit = false;
    }

    /**
     * Retrieves the page receiver's message
     * @public
    */
    function getMessage() {
        if (_message !== null) {
            if (_message.receiver === currentPageObject.name) {
                return _message.message;
            } else {
                return null;
            }
        } else {
            return null;
        }
    }

    /**
     * Setups the tap event
     * @param {String} amdHammerPath (optional)
     * @private
    */
    var setupTapEvent = function (amdHammerPath) {

        if (typeof Hammer !== 'undefined') {
            new Hammer(document.body).on('tap', onNavigation, false);
        }
        else if(typeof require === 'function') {
            require([amdHammerPath], function(Hammer) {

                if(typeof Hammer !== 'undefined') {
                    new Hammer(document.body).on('tap', onNavigation, false);
                } else {
                    document.addEventListener('click', onNavigation, false);
                }
            });
        } else {
            document.addEventListener('click', onNavigation, false);
        }
    };

    var api = {};

    /**
     * Starts the first page
     * @param {String} pageName
     * @public
    */
    function start(pageName) {
        if (isStarted) {
            throw new Error('The first page has already been instantiated');
        }
        var firstPageObject = getPageObject(pageName);
        if(!firstPageObject) {
            throw new Error(pageName + ' does not have a namespace, please use Navigator.on() function');
        }
        var firstPageEl = document.getElementById(pageName);

        if (!firstPageEl.classList.contains('app-active')) {
            firstPageEl.classList.add('app-active');
        }

        if(window.location.hash === '#!' + pageName) {
            load(pageName);
        } else {
            // Reset the hash
            window.location.hash = '#!' + pageName;
        }

        isStarted = true;
    }
    api.start = start;

    /**
     * Returnes the current page (visible
     * @public
    */
    function getCurrentPage() {
        return currentPageObject.name;
    }
    api.getCurrentPage = getCurrentPage;

    /**
     * Returnes the previous page
     * @public
    */
    function getPreviousPage() {
        return previousPageObject.name;
    }
    api.getPreviousPage = getPreviousPage;

    /**
     * Setups the skeleton page (namespace)
     * @param {Object} page
     * @param {Function} callback
     * @param {String} route
     * @public
    */
    function on(pageObject, callback, route) {
        if (typeof pageObject.page !== 'string') {
            throw new TypeError('page name must be a string');
        }
        if (pageObject.asynchronous === undefined) {
            pageObject.asynchronous = false;
        }
        if (typeof pageObject.asynchronous !== 'boolean') {
            throw new TypeError('asynchronous must be a boolean');
        }
        if (callback !== undefined && typeof callback !== 'function') {
            throw new TypeError('callback must be a function');
        }

        pushNewPage(pageObject, callback, route);
    }
    api.on = on;

    /**
     * Navigates to the next page
     * @param {String} : pageName
     * @param {String} : param
     * @public
    */
    function changePage(pageName, param) {
        if (typeof pageName !== 'string') {
            throw new TypeError('page name must be a string');
        }

        if (!onTransition) {
            if(pageName === currentPageObject.name) {
                console.error('The current page is already ' + pageName);
            }
            if(!getPageObject(pageName)) {
                throw new Error(pageName + ' does not have a namespace, please use Navigator.on() function');
            }
            var hash = (param === undefined ? pageName : pageName + '/' + param);
            hash = hash.replace('//', '/');
            window.location.hash = '#!' + hash;
        }
    }
    api.changePage = changePage;

    /**
     * Sets a message for the target page
     * @param {String} pageReceiver
     * @param {Object|String} message
     * @public
    */
    function setMessage(pageReceiver, message) {
        _message = { sender: currentPageObject.name, receiver: pageReceiver, message: message };
    }
    api.setMessage = setMessage;

    /**
     * Initializes the Navigator
     * @param {Object} config
     * @public
    */
    function init(config) {
        if (typeof config !== 'object') {
            throw new TypeError('config must be an object');
        }
        if (typeof config.defaultPage !== 'string') {
            throw new TypeError('default page is not set');
        }
        defaultPage = config.defaultPage;

        /*
        * Optional parameters
        */
        if (config.templatePath !== undefined) {
            setTemplatePath(config.templatePath);
        }

        if (config.hammerPath !== undefined) {
            setupTapEvent(config.hammerPath);
        } else {
            setupTapEvent();
        }
    }
    api.init = init;

    if (!('onhashchange' in window)) {
        throw new Error('Your browser does not support the hashchange event');
    }

    window.addEventListener('hashchange', matchRoutes);
    document.addEventListener('backbutton', onBackButton);

    // Expose the Router either via AMD, CommonJS or the global object
    if (typeof define === 'function' && define.amd) {
        define(function () {
            return api;
        });
    }
    else if (typeof module === 'object' && module.exports){
        module.exports = api;
    }
    else {
        if(window.Phonon === undefined) {
            window.Phonon = {};
        }
        window.Phonon.Navigator = api;
    }

}(window, document));