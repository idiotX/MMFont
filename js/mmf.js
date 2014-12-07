alert('starting...');
var unicodeFontsSupported = {"cherry":"'Cherry Unicode'", "tharlon":"'TharLon'", "pyidaungsu":"'Pyidaungsu'"};
var unicodeFont = "'MON3 Anonta 1'";
var includeFrames = true;

/*!
 * Shim for MutationObserver interface
 * Author: Graeme Yeates (github.com/megawac)
 * Repository: https://github.com/megawac/MutationObserver.js
 * License: WTFPL V2, 2004 (wtfpl.net).
 * Though credit and staring the repo will make me feel pretty, you can modify and redistribute as you please.
 * Attempts to follow spec (http://www.w3.org/TR/dom/#mutation-observers) as closely as possible for native javascript
 * See https://github.com/WebKit/webkit/blob/master/Source/WebCore/dom/MutationObserver.cpp for current webkit source c++ implementation
 */

/**
 * prefix bugs:
    -https://bugs.webkit.org/show_bug.cgi?id=85161
    -https://bugzilla.mozilla.org/show_bug.cgi?id=749920
*/
this.MutationObserver = this.MutationObserver || this.WebKitMutationObserver || (function(undefined) {
    "use strict";
    /**
     * @param {function(Array.<MutationRecord>, MutationObserver)} listener
     * @constructor
     */
    function MutationObserver(listener) {
        /**
         * @type {Array.<Object>}
         * @private
         */
        this._watched = [];
        /** @private */
        this._listener = listener;
    }

    /**
     * Start a recursive timeout function to check all items being observed for mutations
     * @type {MutationObserver} observer
     * @private
     */
    function startMutationChecker(observer) {
        (function check() {
            var mutations = observer.takeRecords();

            if (mutations.length) { //fire away
                //calling the listener with context is not spec but currently consistent with FF and WebKit
                observer._listener(mutations, observer);
            }
            /** @private */
            observer._timeout = setTimeout(check, MutationObserver._period);
        })();
    }

    /**
     * Period to check for mutations (~32 times/sec)
     * @type {number}
     * @expose
     */
    MutationObserver._period = 30 /*ms+runtime*/ ;

    /**
     * Exposed API
     * @expose
     * @final
     */
    MutationObserver.prototype = {
        /**
         * see http://dom.spec.whatwg.org/#dom-mutationobserver-observe
         * not going to throw here but going to follow the current spec config sets
         * @param {Node|null} $target
         * @param {Object|null} config : MutationObserverInit configuration dictionary
         * @expose
         * @return undefined
         */
        observe: function($target, config) {
            /**
             * Using slightly different names so closure can go ham
             * @type {!Object} : A custom mutation config
             */
            var settings = {
                attr: !! (config.attributes || config.attributeFilter || config.attributeOldValue),

                //some browsers are strict in their implementation that config.subtree and childList must be set together. We don't care - spec doesn't specify
                kids: !! config.childList,
                descendents: !! config.subtree,
                charData: !! (config.characterData || config.characterDataOldValue)
            };

            var watched = this._watched;

            //remove already observed target element from pool
            for (var i = 0; i < watched.length; i++) {
                if (watched[i].tar === $target) watched.splice(i, 1);
            }

            if (config.attributeFilter) {
                /**
                 * converts to a {key: true} dict for faster lookup
                 * @type {Object.<String,Boolean>}
                 */
                settings.afilter = reduce(config.attributeFilter, function(a, b) {
                    a[b] = true;
                    return a;
                }, {});
            }

            watched.push({
                tar: $target,
                fn: createMutationSearcher($target, settings)
            });

            //reconnect if not connected
            if (!this._timeout) {
                startMutationChecker(this);
            }
        },

        /**
         * Finds mutations since last check and empties the "record queue" i.e. mutations will only be found once
         * @expose
         * @return {Array.<MutationRecord>}
         */
        takeRecords: function() {
            var mutations = [];
            var watched = this._watched;

            for (var i = 0; i < watched.length; i++) {
                watched[i].fn(mutations);
            }

            return mutations;
        },

        /**
         * @expose
         * @return undefined
         */
        disconnect: function() {
            this._watched = []; //clear the stuff being observed
            clearTimeout(this._timeout); //ready for garbage collection
            /** @private */
            this._timeout = null;
        }
    };

    /**
     * Simple MutationRecord pseudoclass. No longer exposing as its not fully compliant
     * @param {Object} data
     * @return {Object} a MutationRecord
     */
    function MutationRecord(data) {
        var settings = { //technically these should be on proto so hasOwnProperty will return false for non explicitly props
            type: null,
            target: null,
            addedNodes: [],
            removedNodes: [],
            previousSibling: null,
            nextSibling: null,
            attributeName: null,
            attributeNamespace: null,
            oldValue: null
        };
        for (var prop in data) {
            if (has(settings, prop) && data[prop] !== undefined) settings[prop] = data[prop];
        }
        return settings;
    }

    /**
     * Creates a func to find all the mutations
     *
     * @param {Node} $target
     * @param {!Object} config : A custom mutation config
     */
    function createMutationSearcher($target, config) {
        /** type {Elestuct} */
        var $oldstate = clone($target, config); //create the cloned datastructure

        /**
         * consumes array of mutations we can push to
         *
         * @param {Array.<MutationRecord>} mutations
         */
        return function(mutations) {
            var olen = mutations.length;

            //Alright we check base level changes in attributes... easy
            if (config.attr && $oldstate.attr) {
                findAttributeMutations(mutations, $target, $oldstate.attr, config.afilter);
            }

            //check childlist or subtree for mutations
            if (config.kids || config.descendents) {
                searchSubtree(mutations, $target, $oldstate, config);
            }


            //reclone data structure if theres changes
            if (mutations.length !== olen) {
                /** type {Elestuct} */
                $oldstate = clone($target, config);
            }
        };
    }

    /* attributes + attributeFilter helpers */

    /**
     * fast helper to check to see if attributes object of an element has changed
     * doesnt handle the textnode case
     *
     * @param {Array.<MutationRecord>} mutations
     * @param {Node} $target
     * @param {Object.<string, string>} $oldstate : Custom attribute clone data structure from clone
     * @param {Object} filter
     */
    function findAttributeMutations(mutations, $target, $oldstate, filter) {
        var checked = {};
        var attributes = $target.attributes;
        var attr;
        var name;
        var i = attributes.length;
        while (i--) {
            attr = attributes[i];
            name = attr.name;
            if (!filter || has(filter, name)) {
                if (attr.value !== $oldstate[name]) {
                    //The pushing is redundant but gzips very nicely
                    mutations.push(MutationRecord({
                        type: "attributes",
                        target: $target,
                        attributeName: name,
                        oldValue: $oldstate[name],
                        attributeNamespace: attr.namespaceURI //in ie<8 it incorrectly will return undefined
                    }));
                }
                checked[name] = true;
            }
        }
        for (name in $oldstate) {
            if (!(checked[name])) {
                mutations.push(MutationRecord({
                    target: $target,
                    type: "attributes",
                    attributeName: name,
                    oldValue: $oldstate[name]
                }));
            }
        }
    }

    /**
     * searchSubtree: array of mutations so far, element, element clone, bool
     * synchronous dfs comparision of two nodes
     * This function is applied to any observed element with childList or subtree specified
     * Sorry this is kind of confusing as shit, tried to comment it a bit...
     * codereview.stackexchange.com/questions/38351 discussion of an earlier version of this func
     *
     * @param {Array} mutations
     * @param {Node} $target
     * @param {!Object} $oldstate : A custom cloned node from clone()
     * @param {!Object} config : A custom mutation config
     */
    function searchSubtree(mutations, $target, $oldstate, config) {
        /*
         * Helper to identify node rearrangment and stuff...
         * There is no gaurentee that the same node will be identified for both added and removed nodes
         * if the positions have been shuffled.
         * conflicts array will be emptied by end of operation
         */
        function resolveConflicts(conflicts, node, $kids, $oldkids, numAddedNodes) {
            // the distance between the first conflicting node and the last
            var distance = conflicts.length - 1;
            // prevents same conflict being resolved twice consider when two nodes switch places.
            // only one should be given a mutation event (note -~ is used as a math.ceil shorthand)
            var counter = -~((distance - numAddedNodes) / 2);
            var $cur;
            var oldstruct;
            var conflict;
            while((conflict = conflicts.pop())) {
                $cur = $kids[conflict.i];
                oldstruct = $oldkids[conflict.j];

                //attempt to determine if there was node rearrangement... won't gaurentee all matches
                //also handles case where added/removed nodes cause nodes to be identified as conflicts
                if (config.kids && counter && Math.abs(conflict.i - conflict.j) >= distance) {
                    mutations.push(MutationRecord({
                        type: "childList",
                        target: node,
                        addedNodes: [$cur],
                        removedNodes: [$cur],
                        // haha don't rely on this please
                        nextSibling: $cur.nextSibling,
                        previousSibling: $cur.previousSibling
                    }));
                    counter--; //found conflict
                }

                //Alright we found the resorted nodes now check for other types of mutations
                if (config.attr && oldstruct.attr) findAttributeMutations(mutations, $cur, oldstruct.attr, config.afilter);
                if (config.charData && $cur.nodeType === 3 && $cur.nodeValue !== oldstruct.charData) {
                    mutations.push(MutationRecord({
                        type: "characterData",
                        target: $cur,
                        oldValue: oldstruct.charData
                    }));
                }
                //now look @ subtree
                if (config.descendents) findMutations($cur, oldstruct);
            }
        }

        /**
         * Main worker. Finds and adds mutations if there are any
         * @param {Node} node
         * @param {!Object} old : A cloned data structure using internal clone
         */
        function findMutations(node, old) {
            var $kids = node.childNodes;
            var $oldkids = old.kids;
            var klen = $kids.length;
            // $oldkids will be undefined for text and comment nodes
            var olen = $oldkids ? $oldkids.length : 0;
            // if (!olen && !klen) return; //both empty; clearly no changes

            //we delay the intialization of these for marginal performance in the expected case (actually quite signficant on large subtrees when these would be otherwise unused)
            //map of checked element of ids to prevent registering the same conflict twice
            var map;
            //array of potential conflicts (ie nodes that may have been re arranged)
            var conflicts;
            var id; //element id from getElementId helper
            var idx; //index of a moved or inserted element

            var oldstruct;
            //current and old nodes
            var $cur;
            var $old;
            //track the number of added nodes so we can resolve conflicts more accurately
            var numAddedNodes = 0;

            //iterate over both old and current child nodes at the same time
            var i = 0, j = 0;
            //while there is still anything left in $kids or $oldkids (same as i < $kids.length || j < $oldkids.length;)
            while( i < klen || j < olen ) {
                //current and old nodes at the indexs
                $cur = $kids[i];
                oldstruct = $oldkids[j];
                $old = oldstruct && oldstruct.node;

                if ($cur === $old) { //expected case - optimized for this case
                    //check attributes as specified by config
                    if (config.attr && oldstruct.attr) /* oldstruct.attr instead of textnode check */findAttributeMutations(mutations, $cur, oldstruct.attr, config.afilter);
                    //check character data if set
                    if (config.charData && $cur.nodeType === 3 && $cur.nodeValue !== oldstruct.charData) {
                        mutations.push(MutationRecord({
                            type: "characterData",
                            target: $cur,
                            oldValue: oldstruct.charData
                        }));
                    }

                    //resolve conflicts; it will be undefined if there are no conflicts - otherwise an array
                    if (conflicts) resolveConflicts(conflicts, node, $kids, $oldkids, numAddedNodes);

                    //recurse on next level of children. Avoids the recursive call when there are no children left to iterate
                    if (config.descendents && ($cur.childNodes.length || oldstruct.kids && oldstruct.kids.length)) findMutations($cur, oldstruct);

                    i++;
                    j++;
                } else { //(uncommon case) lookahead until they are the same again or the end of children
                    if(!map) { //delayed initalization (big perf benefit)
                        map = {};
                        conflicts = [];
                    }
                    if ($cur) {
                        //check id is in the location map otherwise do a indexOf search
                        if (!(map[id = getElementId($cur)])) { //to prevent double checking
                            //mark id as found
                            map[id] = true;
                            //custom indexOf using comparitor checking oldkids[i].node === $cur
                            if ((idx = indexOfCustomNode($oldkids, $cur, j)) === -1) {
                                if (config.kids) {
                                    mutations.push(MutationRecord({
                                        type: "childList",
                                        target: node,
                                        addedNodes: [$cur], //$cur is a new node
                                        nextSibling: $cur.nextSibling,
                                        previousSibling: $cur.previousSibling
                                    }));
                                    numAddedNodes++;
                                }
                            } else {
                                conflicts.push({ //add conflict
                                    i: i,
                                    j: idx
                                });
                            }
                        }
                        i++;
                    }

                    if ($old &&
                       //special case: the changes may have been resolved: i and j appear congurent so we can continue using the expected case
                       $old !== $kids[i]
                    ) {
                        if (!(map[id = getElementId($old)])) {
                            map[id] = true;
                            if ((idx = indexOf($kids, $old, i)) === -1) {
                                if(config.kids) {
                                    mutations.push(MutationRecord({
                                        type: "childList",
                                        target: old.node,
                                        removedNodes: [$old],
                                        nextSibling: $oldkids[j + 1], //praise no indexoutofbounds exception
                                        previousSibling: $oldkids[j - 1]
                                    }));
                                    numAddedNodes--;
                                }
                            } else {
                                conflicts.push({
                                    i: idx,
                                    j: j
                                });
                            }
                        }
                        j++;
                    }
                }//end uncommon case
            }//end loop

            //resolve any remaining conflicts
            if (conflicts) resolveConflicts(conflicts, node, $kids, $oldkids, numAddedNodes);
        }
        findMutations($target, $oldstate);
    }

    /**
     * Utility
     * Cones a element into a custom data structure designed for comparision. https://gist.github.com/megawac/8201012
     *
     * @param {Node} $target
     * @param {!Object} config : A custom mutation config
     * @return {!Object} : Cloned data structure
     */
    function clone($target, config) {
        var recurse = true; // set true so childList we'll always check the first level
        return (function copy($target) {
            var isText = $target.nodeType === 3;
            var elestruct = {
                /** @type {Node} */
                node: $target
            };

            //is text or comemnt node
            if (isText || $target.nodeType === 8) {
                if (isText && config.charData) {
                    elestruct.charData = $target.nodeValue;
                }
            } else { //its either a element or document node (or something stupid)

                if(config.attr && recurse) { // add attr only if subtree is specified or top level
                    /**
                     * clone live attribute list to an object structure {name: val}
                     * @type {Object.<string, string>}
                     */
                    elestruct.attr = reduce($target.attributes, function(memo, attr) {
                        if (!config.afilter || config.afilter[attr.name]) {
                            memo[attr.name] = attr.value;
                        }
                        return memo;
                    }, {});
                }

                // whether we should iterate the children of $target node
                if(recurse && ((config.kids || config.charData) || (config.attr && config.descendents)) ) {
                    /** @type {Array.<!Object>} : Array of custom clone */
                    elestruct.kids = map($target.childNodes, copy);
                }

                recurse = config.descendents;
            }
            return elestruct;
        })($target);
    }

    /**
     * indexOf an element in a collection of custom nodes
     *
     * @param {NodeList} set
     * @param {!Object} $node : A custom cloned node
     * @param {number} idx : index to start the loop
     * @return {number}
     */
    function indexOfCustomNode(set, $node, idx) {
        return indexOf(set, $node, idx, JSCompiler_renameProperty("node"));
    }

    //using a non id (eg outerHTML or nodeValue) is extremely naive and will run into issues with nodes that may appear the same like <li></li>
    var counter = 1; //don't use 0 as id (falsy)
    /** @const */
    var expando = "mo_id";

    /**
     * Attempt to uniquely id an element for hashing. We could optimize this for legacy browsers but it hopefully wont be called enough to be a concern
     *
     * @param {Node} $ele
     * @return {(string|number)}
     */
    function getElementId($ele) {
        try {
            return $ele.id || ($ele[expando] = $ele[expando] || counter++);
        } catch (o_O) { //ie <8 will throw if you set an unknown property on a text node
            try {
                return $ele.nodeValue; //naive
            } catch (shitie) { //when text node is removed: https://gist.github.com/megawac/8355978 :(
                return counter++;
            }
        }
    }

    /**
     * **map** Apply a mapping function to each item of a set
     * @param {Array|NodeList} set
     * @param {Function} iterator
     */
    function map(set, iterator) {
        var results = [];
        for (var index = 0; index < set.length; index++) {
            results[index] = iterator(set[index], index, set);
        }
        return results;
    }

    /**
     * **Reduce** builds up a single result from a list of values
     * @param {Array|NodeList|NamedNodeMap} set
     * @param {Function} iterator
     * @param {*} [memo] Initial value of the memo.
     */
    function reduce(set, iterator, memo) {
        for (var index = 0; index < set.length; index++) {
            memo = iterator(memo, set[index], index, set);
        }
        return memo;
    }

    /**
     * **indexOf** find index of item in collection.
     * @param {Array|NodeList} set
     * @param {Object} item
     * @param {number} idx
     * @param {string} [prop] Property on set item to compare to item
     */
    function indexOf(set, item, idx, prop) {
        for (/*idx = ~~idx*/; idx < set.length; idx++) {//start idx is always given as this is internal
            if ((prop ? set[idx][prop] : set[idx]) === item) return idx;
        }
        return -1;
    }

    /**
     * @param {Object} obj
     * @param {(string|number)} prop
     * @return {boolean}
     */
    function has(obj, prop) {
        return obj[prop] !== undefined; //will be nicely inlined by gcc
    }

    // GCC hack see http://stackoverflow.com/a/23202438/1517919
    function JSCompiler_renameProperty(a) {
        return a;
    }

    return MutationObserver;
})(void 0);

/**
 * Knayi-myscript Client-side script
 *
 * version: 1.1.2
 * date: 9 July, 2014
 * Licensed: MIT
 * http://opensource.knayi.com/knayi-myscript
 * 
 */

(function(global){

﻿  var core_version = "1.1.0",
﻿  core_obj = {},
﻿  whitespace = "[\\x20\\t\\r\\n\\f]",
﻿  rtrim = new RegExp( "^" + whitespace + "+|((?:^|[^\\\\])(?:\\\\.)*)" + whitespace + "+$", "g" ),
﻿  rZawgyi = /[\u1000-\u1097\u1e29]/,
﻿  rInputs = /^INPUT|TEXTAREA|SELECT$/,

﻿  // Usable font-type shortcut
﻿  fontTypes = {
﻿  ﻿  unicode5: "unicode5",
﻿  ﻿  unicode: "unicode5",
﻿  ﻿  uni5: "unicode5",
﻿  ﻿  uni: "unicode5",
﻿  ﻿  zawgyi: "zawgyi",
﻿  ﻿  zaw: "zawgyi"
﻿  },

﻿  fontType2Lang = {
﻿  ﻿  unicode5: 'my',
﻿  ﻿  unicode: 'my',
﻿  ﻿  zawgyi: 'zawgyi'
﻿  },

﻿  /** 
﻿   * Main Library;
﻿   */
﻿  library = {

﻿  ﻿  // Font Detecting Library
﻿  ﻿  detect: {
﻿  ﻿  ﻿  unicode5: [
﻿  ﻿  ﻿  ﻿  'ှ', 'ဿ', 'ည်', 'န်', 'င်', 'ေး', 'ော',
﻿  ﻿  ﻿  ﻿  '်း', 'ဵ', '[ၐ-ၙ]', '^([က-အ]ြ|[က-အ]ေ)'
﻿  ﻿  ﻿  ],
﻿  ﻿  ﻿  zawgyi : [
﻿  ﻿  ﻿  ﻿  'ာ္', '်ာ', whitespace+'(ျ|ေ|[ၾ-ႄ])[က-အ]'
﻿  ﻿  ﻿  ﻿  ,'^(ျ|ေ|[ၾ-ႄ])[က-အ]', '[က-အ]္[^က-အ]', 'ဥ္'
﻿  ﻿  ﻿  ﻿  ,'္း' ,'[ါ-ူေ်း](ျ|[ၾ-ႄ])[က-အ]' ,'ံု'
﻿  ﻿  ﻿  ﻿  ,'[က-အ]္ေ' , 'ၤ','္'+whitespace, 'ာေ'
﻿  ﻿  ﻿  ﻿  ,'[ါ-ူ်း]ေ[က-အ]', 'ေေ', 'ုိ', '္$'
﻿  ﻿  ﻿  ]

﻿  ﻿  },

﻿  ﻿  /**
﻿  ﻿   * Font Converting Library
﻿  ﻿   * library can use exchange method, when direct library don't support
﻿  ﻿   *
﻿  ﻿   * "[Base Font]": {
﻿  ﻿   *     "[Coverable Font]": {
﻿  ﻿   * ﻿  ﻿  ﻿  singleReplace: [One Time replace],
﻿  ﻿   *﻿  ﻿  ﻿  whileReplace: [While Match replace]
﻿  ﻿   * ﻿  ﻿  }
﻿  ﻿   * }
﻿  ﻿   */
﻿  ﻿  convert: {

﻿  ﻿  ﻿  unicode5: {

﻿  ﻿  ﻿  ﻿  zawgyi: {
﻿  ﻿  ﻿  ﻿  ﻿  singleReplace: [

﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/([က-အ](္[က-အ]|[ျြွ]+)[ိီေဲံ့ှ]*)ု/g, "$1ဳ"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/([က-အ](္[က-အ]|[ျြွ]+)[ိီေဲံ့ှ]*)ူ/g, "$1ဴ"],

﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/([က-အ](္[က-အ]|[ျြွ]+)[ိီေဲံ့ှ]*)့/g, "$1႔"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/([က-အ])ျ([ွ][ှ]*)/g, "$1ၽ$2"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/([ုူ])[့႔]/g, "$1႕"],

﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/([က-အ])ြ/g, "ြ$1"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/([က-အ][^က-အ]*)ေ/g, "ေ$1"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ြေ/g, "ေြ"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/နွ/g, "ႏွ"],

﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/၎င်း/g, "၎"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ါ်/g, "ၚ"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ဿ/g, "ႆ"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/္လ/g, "ႅ"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/္မ/g, "ၼ"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/္ဘ/g, "ၻ"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/္ဗ/g, "ၺ"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/္ဖ/g, "ၹ"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/္ဖ/g, "ၹ"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/္ပ/g, "ၸ"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/္န/g, "ၷ"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/္ဓ/g, "ၶ"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/္ဒ/g, "ၵ"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/္ထ/g, "ၳ"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/္တ/g, "ၱ"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/္ဏ/g, "ၰ"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ဎ္ဍ/g, "ၯ"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ဏ္ဍ/g, "႑"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ဍ္ဍ/g, "ၮ"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/္ဌ/g, "ၭ"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/္ဋ/g, "ၬ"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ဉ/g, "ၪ"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/္စျ/g, "ၩ"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/္ဇ/g, "ၨ"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/္ဆ/g, "ၦ"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/္စ/g, "ၥ"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/္ဃ/g, "ၣ"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ဌ/g, "႒"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/္ဂ/g, "ၢ"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/္ခ/g, "ၡ"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ွှ/g, "ႊ"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ှူ/g, "ႉ"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/္က/g, "ၠ"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ဋ္ဋ/g, "႗"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/င်္/g, "ၤ"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ှု/g, "ႈ"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/့/g, "့"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/်/g, "္"], 
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ျ/g, "်"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ြ/g, "ျ"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ွ/g, "ြ"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ှ/g, "ွ"]

﻿  ﻿  ﻿  ﻿  ﻿  ﻿  //ဆွေးနွေးပွဲဆိုင်ရာ 
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  //ေဆြးေနြးပြဲဆိုင္ရာ

﻿  ﻿  ﻿  ﻿  ﻿  ],
﻿  ﻿  ﻿  ﻿  ﻿  whileReplace: [
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/([ျြွှ])ေ/g, "ေ$1"],

﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ျ([ကဃဆဏတထဘယလသဟအ])/g, "ၾ$1"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ျ([က-အ](ြွ|ႊ|ြ)[ိီ])/g, "ႃ$1"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ၾ([က-အ](ြွ|ႊ|ြ)[ိီ])/g, "ႄ$1"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ျ([က-အ][ိီ])/g, "ၿ$1"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ၾ([က-အ][ိီ])/g, "ႀ$1"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ျ([က-အ][ြ])/g, "ႁ$1"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ၾ([က-အ][ြ])/g, "ႂ$1"]
﻿  ﻿  ﻿  ﻿  ﻿  ]
﻿  ﻿  ﻿  ﻿  }
﻿  ﻿  ﻿  },
﻿  ﻿  ﻿  zawgyi: {

﻿  ﻿  ﻿  ﻿  unicode5: {
﻿  ﻿  ﻿  ﻿  ﻿  singleReplace: [
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ွ/g, 'ှ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ြ/g, 'ွ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/[ျၾ-ႄ]/g, 'ြ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/[်ၽ]/g, 'ျ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/္/g, '်'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/[႔-႕]/g, '့'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/[ၻ႓]/g, '္ဘ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ဳ/g, 'ု'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ဴ/g, 'ူ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ႈ/g, 'ှု'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ၤ/g, 'င်္'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ႉ/g, 'ှူ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ႊ/g, 'ွှ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ၡ/g, '္ခ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ႏ/g, 'န'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ၢ/g, '္ဂ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ၣ/g, '္ဃ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ၥ/g, '္စ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ၦ/g, '္ဆ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ၨ/g, '္ဇ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ၩ/g, '္စျ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ၪ/g, 'ဉ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ၫ/g, 'ည'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ၬ/g, '္ဋ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ၭ/g, '္ဌ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ၮ/g, 'ဍ္ဍ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ၯ/g, 'ဎ္ဍ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ၰ/g, '္ဏ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ၱ/g, '္တ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ၳ/g, '္ထ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ၵ/g, '္ဒ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ၶ/g, '္ဓ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ၷ/g, '္န'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ၸ/g, '္ပ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ၹ/g, '္ဖ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ၹ/g, '္ဖ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ၺ/g, '္ဗ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ၼ/g, '္မ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ႅ/g, '္လ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ႆ/g, 'ဿ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/႐/g, 'ရ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/႑/g, 'ဏ္ဍ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/႒/g, 'ဌ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/႗/g, 'ဋ္ဋ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ၠ/g, '္က'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ၚ/g, 'ါ်'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/၎/g, '၎င်း'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ဥ်/g, 'ဉ်'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ႋ/g, 'င်္ိ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ႌ/g, 'င်္ီ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ႍ/g, 'င်္ံ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ႎ/g, 'ိံ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ြ([က-အ])/g, '$1ြ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ေ([က-အ])/g, '$1ေ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/([ျြွ])(င်္)/g, '$2$1'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ေ(င်္)/g, '$1ေ'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/([က-အ])(င်္)/g, '$2$1'],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/\u0020(္[က-အ])/g, '$1']
﻿  ﻿  ﻿  ﻿  ﻿  ],
﻿  ﻿  ﻿  ﻿  ﻿  whileReplace: [
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/([ါာိီေုူဲံ့း])([ျြွှ])/g, "$2$1"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ွ([ျြ])/g, "$1ွ"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ှ([ျြွ])/g, "$1ှ"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/([ုူ])([ိီ])/g, "$2$1"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/ံ([ိီုူ])/g, "$1ံ"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/့([ောါုူဲ])/g, "$1့"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/([ေါာ])(္[က-အ])/g, "$2$1"],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  [/([ါာ])(င်္)/g, "$2$1"]
﻿  ﻿  ﻿  ﻿  ﻿  ]﻿  
﻿  ﻿  ﻿  ﻿  }
﻿  ﻿  ﻿  }

﻿  ﻿  },
﻿   
﻿  ﻿  /**
﻿  ﻿   * Syllable Character Breaking
﻿  ﻿   * https://github.com/andjc/jquery.mymr
﻿  ﻿   *
﻿  ﻿   * License: GPL 3.0
﻿  ﻿   * Currently supports: Burmese, Mon, S'gaw Karen
﻿  ﻿   *
﻿  ﻿   * 2013-04-08
﻿  ﻿   */
﻿  ﻿  syllable: {

﻿  ﻿  ﻿  // Zawgyi Font-type "Burmese" break point
﻿  ﻿  ﻿  'zawgyi': [
﻿  ﻿  ﻿  ﻿  [/([က-အဣ-ဧဩဪ၌-၏ႆႏ-႒])/g, '\u200B$1'],
﻿  ﻿  ﻿  ﻿  [/([\u1031][\u103b\u107e-\u1084]|[\u1031\u103b\u107e-\u1084])/g, '\u200B$1'],
﻿  ﻿  ﻿  ﻿  [/([\u1031\u103b\u107e-\u1084])\u200B([\u1000-\u1021\u1025\u1029\u106A\u106B\u1086\u108F\u1090])/g, '$1$2'],
﻿  ﻿  ﻿  ﻿  [/([\u0009-\u000d\u0020\u00a0\u2000-\u200a\u2028\u2029\u202f]|>|\u201C|\u2018|\-|\(|\[|{|[\u2012-\u2014])\u200B([\u1000-\u1021\u1031\u103b\u1025\u1029\u106A\u106B\u107e-\u1084\u1086\u108F\u1090])/g, '$1$2'],
﻿  ﻿  ﻿  ﻿  [/\u200B([\u1000-\u1021\u1025\u1029\u106A\u106B\u1086\u108F\u1090]\u1039)/g, '$1'],
﻿  ﻿  ﻿  ﻿  [/(\s|\n)\u200B([က-အဣ-ဧဩဪ၌-၏ႆႏ-႒])/g, '$1$2'],
﻿  ﻿  ﻿  ﻿  [/([က-အ])\u200B([က-အ\u1031\u103b\u107e-\u1084])/g, '$1$2']
﻿  ﻿  ﻿  ],

﻿  ﻿  ﻿  // Unicode5.2 Font-type Burmese break points
﻿  ﻿  ﻿  'my': [
﻿  ﻿  ﻿  ﻿  [/(\u103A)(\u1037)/g, "$2$1"],
﻿  ﻿  ﻿  ﻿  [/([က-အဣ-ဧဩဪဿ၌-၏])/g, "\u200B$1"],
﻿  ﻿  ﻿  ﻿  [/([\u0009-\u000d\u0020\u00a0\u2000-\u200a\u2028\u2029\u202f]|>|\u201C|\u2018|\-|\(|\[|{|[\u2012-\u2014]|\u1039)\u200B([\u1000-\u1021])/g, "$1$2"],
﻿  ﻿  ﻿  ﻿  [/\u200B(\u1004\u103A\u1039)/g, "$1"],
﻿  ﻿  ﻿  ﻿  [/\u200B([\u1000-\u1021]\u103A)/g, "$1"],
﻿  ﻿  ﻿  ﻿  [/(\s|\n)\u200B([က-အဣ-ဧဩဪဿ၌-၏])/g, "$1$2"],
﻿  ﻿  ﻿  ﻿  [/([က-အ])\u200B([က-အ])/g, "$1$2"]
﻿  ﻿  ﻿  ],
﻿  ﻿  ﻿  'rki': [
﻿  ﻿  ﻿  ﻿  [/(\u103A)(\u1037)/g, "$2$1"],
﻿  ﻿  ﻿  ﻿  [/([က-အဣ-ဧဩဪဿ၌-၏])/g, "\u200B$1"],
﻿  ﻿  ﻿  ﻿  [/([\u0009-\u000d\u0020\u00a0\u2000-\u200a\u2028\u2029\u202f]|>|\u201C|\u2018|\-|\(|\[|{|[\u2012-\u2014]|\u1039)\u200B([\u1000-\u1021])/g, "$1$2"],
﻿  ﻿  ﻿  ﻿  [/\u200B(\u1004\u103A\u1039)/g, "$1"],
﻿  ﻿  ﻿  ﻿  [/\u200B([\u1000-\u1021]\u103A)/g, "$1"],
﻿  ﻿  ﻿  ﻿  [/(\s|\n)\u200B([က-အဣ-ဧဩဪဿ၌-၏])/g, "$1$2"],
﻿  ﻿  ﻿  ﻿  [/([က-အ])\u200B([က-အ])/g, "$1$2"]
﻿  ﻿  ﻿  ],
﻿  ﻿  ﻿  'tvn': [
﻿  ﻿  ﻿  ﻿  [/(\u103A)(\u1037)/g, "$2$1"],
﻿  ﻿  ﻿  ﻿  [/([က-အဣ-ဧဩဪဿ၌-၏])/g, "\u200B$1"],
﻿  ﻿  ﻿  ﻿  [/([\u0009-\u000d\u0020\u00a0\u2000-\u200a\u2028\u2029\u202f]|>|\u201C|\u2018|\-|\(|\[|{|[\u2012-\u2014]|\u1039)\u200B([\u1000-\u1021])/g, "$1$2"],
﻿  ﻿  ﻿  ﻿  [/\u200B(\u1004\u103A\u1039)/g, "$1"],
﻿  ﻿  ﻿  ﻿  [/\u200B([\u1000-\u1021]\u103A)/g, "$1"],
﻿  ﻿  ﻿  ﻿  [/(\s|\n)\u200B([က-အဣ-ဧဩဪဿ၌-၏])/g, "$1$2"],
﻿  ﻿  ﻿  ﻿  [/([က-အ])\u200B([က-အ])/g, "$1$2"]
﻿  ﻿  ﻿  ],
﻿  ﻿  ﻿  'int': [
﻿  ﻿  ﻿  ﻿  [/(\u103A)(\u1037)/g, "$2$1"],
﻿  ﻿  ﻿  ﻿  [/([က-အဣ-ဧဩဪဿ၌-၏])/g, "\u200B$1"],
﻿  ﻿  ﻿  ﻿  [/([\u0009-\u000d\u0020\u00a0\u2000-\u200a\u2028\u2029\u202f]|>|\u201C|\u2018|\-|\(|\[|{|[\u2012-\u2014]|\u1039)\u200B([\u1000-\u1021])/g, "$1$2"],
﻿  ﻿  ﻿  ﻿  [/\u200B(\u1004\u103A\u1039)/g, "$1"],
﻿  ﻿  ﻿  ﻿  [/\u200B([\u1000-\u1021]\u103A)/g, "$1"],
﻿  ﻿  ﻿  ﻿  [/(\s|\n)\u200B([က-အဣ-ဧဩဪဿ၌-၏])/g, "$1$2"],
﻿  ﻿  ﻿  ﻿  [/([က-အ])\u200B([က-အ])/g, "$1$2"]
﻿  ﻿  ﻿  ],

﻿  ﻿  ﻿  // S'gaw Karen break points
﻿  ﻿  ﻿  'ksw': [
﻿  ﻿  ﻿  ﻿  [/([\u1000-\u1006\u100a\u1010-\u1012\u1014-\u1016\u1018-\u101f\u1021\u1027\u1061])/g, '\u200B$1'],
﻿  ﻿  ﻿  ﻿  [/(^|[\u0009-\u000d\u0020\u00a0\u2000-\u200a\u2028\u2029\u202f]|\||>|[\u0021-\u0023\u0025-\u002A\u002C-\u002F\u003A\u003B\u003F\u0040\u005B-\u005D\u005F\u007B\u007D\u00A1\u00A7\u00AB\u00B6\u00B7\u00BB\u00BF\u104A-\u104F\u2010-\u2027\u2030-\u2043\u2045-\u2051\u2053-\u205E]|\u200B)\|/g, '$1']
﻿  ﻿  ﻿  ],
﻿  ﻿  ﻿  'pwo': [],
﻿  ﻿  ﻿  'kjp': [],
﻿  ﻿  ﻿  'blk': [],

﻿  ﻿  ﻿  // Mon break points
﻿  ﻿  ﻿  'mnw': [
﻿  ﻿  ﻿  ﻿  [/(\u103A)(\u1037)/g, '$2$1'],
﻿  ﻿  ﻿  ﻿  [/([\u1000-\u1003\u1005-\u1007\u1009-\u1021\u1023\u1025\u1028-\u102A\u105A-\u105D])/g, '\u200B$1'],
﻿  ﻿  ﻿  ﻿  [/([\u0009-\u000d\u0020\u00a0\u2000-\u200a\u2028\u2029\u202f]|>|\u201C|\u2018|\-|\(|\[|{|[\u2012-\u2014]|\u1039)\u200B([\u1000-\u1003\u1005-\u1007\u1009-\u1021\u105A-\u105D])/g, '$1$2'],
﻿  ﻿  ﻿  ﻿  [/\u200B([\u1000-\u1003\u1005-\u1007\u1009-\u1021\u105A-\u105D]\u103A)/g, '$1'],
﻿  ﻿  ﻿  ﻿  [/(\s|\n)\u200B([\u1000-\u1003\u1005-\u1007\u1009-\u1021\u1023\u1025\u1028-\u102A\u105A-\u105D])/g, '$1$2']
﻿  ﻿  ﻿  ],
﻿  ﻿  ﻿  'kyu': [],
﻿  ﻿  ﻿  'csh': [],

﻿  ﻿  ﻿  // Shan break points
﻿  ﻿  ﻿  'shn':[
﻿  ﻿  ﻿  ﻿  [/([\u1004\u1010\u1011\u1015\u1019-\u101E\u1022\u1075-\u1081\u109E\u109F])/g, '\u200B$1'],
﻿  ﻿  ﻿  ﻿  [/\u200B([\u1004\u1010\u1011\u1015\u1019-\u101C\u101E\u1022\u1075-\u1079\u107B-\u1081\u109E\u109F]\u103A)/g, '$1'],
﻿  ﻿  ﻿  ﻿  [/([\u0009-\u000d\u0020\u00a0\u2000-\u200a\u2028\u2029\u202f>\u201C\u2018\-\(\[{\u2012-\u2014])\u200B([\u1004\u1010\u1011\u1015\u1019-\u101E\u1022\u1075-\u1081\u109E\u109F])/g, '$1$2']
﻿  ﻿  ﻿  ],

﻿  ﻿  ﻿  // Khmati Shan break points
﻿  ﻿  ﻿  'kht': [
﻿  ﻿  ﻿  ﻿  [/([\u1000\u1002\u1004\u1010\u1011\u1015\u1019-\u101D\u1022\u1075\u1078\u1079\u107B\u107C\u107F\u1080\uAA60-\uAA6F\uAA71-\uAA76])/g, '\u200B$1'],
﻿  ﻿  ﻿  ﻿  [/\u200B([\u1000\u1004\u1010\u1015\u1019\u101D\uAA65\uAA6B]\u103A)/g, '$1'],
﻿  ﻿  ﻿  ﻿  [/([\u0009-\u000d\u0020\u00a0\u2000-\u200a\u2028\u2029\u202f>\u201C\u2018\-\(\[{\u2012-\u2014])\u200B([\u1000\u1002\u1004\u1010\u1011\u1015\u1019-\u101D\u1022\u1075\u1078\u1079\u107B\u107C\u107F\u1080\uAA60-\uAA6F\uAA71-\uAA76])/g, '$1$2']
﻿  ﻿  ﻿  ],
﻿  ﻿  ﻿  'aio': [],
﻿  ﻿  ﻿  'phk': [],
﻿  ﻿  ﻿  'tle': [],
﻿  ﻿  ﻿  'pll': [],
﻿  ﻿  ﻿  'pce': [],
﻿  ﻿  ﻿  'rbb': []

﻿  ﻿  },

﻿  ﻿  /**
﻿  ﻿   * Knayi Keyboards
﻿  ﻿   */
﻿  ﻿  keyboards: {

﻿  ﻿  ﻿  enUnicode5: {
﻿  ﻿  ﻿  ﻿  keyfix: {
﻿  ﻿  ﻿  ﻿  ﻿  // Basic "EN" Keyboard keys changes
﻿  ﻿  ﻿  ﻿  ﻿  from: "` 1 2 3 4 5 6 7 8 9 0 - = ~ ! @ # $ % ^ & * ( ) _ + q w e r t y u i o p [ ] \\ Q W E R T Y U I O P { } | a s d f g h j k l ; ' A S D F G H J K L : \" z x c v b n m , . / Z X C V B N M < > ?".split(" "),
﻿  ﻿  ﻿  ﻿  ﻿  to: "` ၁ ၂ ၃ ၄ ၅ ၆ ၇ ၈ ၉ ၀ - = ~ ဍ ဏ္ဍ ဋ ၌ % / ရ ဂ ( ) × + ဆ တ န မ အ ပ က င သ စ ဟ ] ၏ ျှ ျွှ န ျွ ွှ ့ ့ ှု ဥ ဏ ဧ ္ ဌ ေ ျ ိ ် ါ ့ ြ ု ူ း ဒ ဗ ှ ီ င်္ ွ ံ ဲ ု ူ ါ် ဓ ဖ ထ ခ လ ဘ ည ာ ယ . ။ ဇ ဌ ဃ ဠ ြ ြ ြ ဝ ဈ ၊".split(" ")
﻿  ﻿  ﻿  ﻿  },
﻿  ﻿  ﻿  ﻿  // Adding ေ first fix
﻿  ﻿  ﻿  ﻿  rexfix: [
﻿  ﻿  ﻿  ﻿  ﻿  [/\u200B([\u1022-\u1030\u1032-\u103B\u103D-\u104F])$/, "$1"],
﻿  ﻿  ﻿  ﻿  ﻿  [/ေြ([က-အ])$/, "$1ြေ\u200B"],
﻿  ﻿  ﻿  ﻿  ﻿  [/([ေြ])([က-အ])$/, "$2$1\u200B"],
﻿  ﻿  ﻿  ﻿  ﻿  [/([ေြ])([ွှ])$/, "$2$1"],
﻿  ﻿  ﻿  ﻿  ﻿  [/ံု$/, "ုံ"]
﻿  ﻿  ﻿  ﻿  ]
﻿  ﻿  ﻿  },

﻿  ﻿  ﻿  zawUnicode5: {
﻿  ﻿  ﻿  ﻿  keyfix: {
﻿  ﻿  ﻿  ﻿  ﻿  // Zawgyi Keyboard base keys changes
﻿  ﻿  ﻿  ﻿  ﻿  from: "` ၁ ၂ ၃ ၄ ၅ ၆ ၇ ၈ ၉ ၀ - = ~ ဍ ႑ ဋ ၌ % / ရ ဂ ( ) × + ဆ တ န မ အ ပ က င သ စ ဟ ] ၏ ွ် ၽႊ ႏ ၽြ ႊ ႔ ႕ ႈ ဥ ဏ ဧ } ႒ ေ ် ိ ္ ါ ့ ျ ု ူ း ဒ ဗ ွ ီ ၤ ြ ံ ဲ ဳ ဴ ၚ ဓ ဖ ထ ခ လ ဘ ည ာ ယ . ။ ဇ ဌ ဃ ဠ ႀ ၿ ၾ ဝ ဈ ၊ ၮ ႗ ၎ ဩ ဝ ၬ ဪ ၢ ဦ ၦ ၱ ၷ ၼ ဤ ၸ ၠ ၍ ႆ ၥ ႇ် ႖ ဣ ႕ ၪ ၰ ၽ ႎ ႍ ႃ ႉ ၵ ၺ ႇ ႌ ႋ ႄ ၶ ၹ ၳ ၡ ႅ ၻ ဉ ဎ ၨ ၭ ၣ ႁ ႂ ၯ ၩ".split(" "),
﻿  ﻿  ﻿  ﻿  ﻿  to: "` ၁ ၂ ၃ ၄ ၅ ၆ ၇ ၈ ၉ ၀ - = ~ ဍ ဏ္ဍ ဋ ၌ % / ရ ဂ ( ) × + ဆ တ န မ အ ပ က င သ စ ဟ ] ၏ ျှ ျွှ န ျွ ွှ ့ ့ ှု ဥ ဏ ဧ } ဌ ေ ျ ိ ် ါ ့ ြ ု ူ း ဒ ဗ ှ ီ င်္ ွ ံ ဲ ု ူ ါ် ဓ ဖ ထ ခ လ ဘ ည ာ ယ . ။ ဇ ဌ ဃ ဠ ြ ြ ြ ဝ ဈ ၊ ဍ္ဍ ဋ္ဋ ၎င်း ဩ ဝ ္ဋ ဪ ္ဂ ဦ ္ဆ ္တ ္န ္မ ဤ ္ပ ္က ၍ ဿ ္စ ျှ ႖ ဣ ့ ဉ ္ဏ ျ ိံ င်္ံ ြ ှူ ္ဒ ္ဗ ႇ င်္ီ င်္ိ ြ ္ဓ ္ဖ ္ထ ္ခ ္လ ္ဘ ဉ ဎ ္ဇ ္ဌ ္ဃ ြ ြ ဎ္ဍ ္စျ".split(" ")
﻿  ﻿  ﻿  ﻿  },
﻿  ﻿  ﻿  ﻿  // Adding ေ first fix
﻿  ﻿  ﻿  ﻿  rexfix: [
﻿  ﻿  ﻿  ﻿  ﻿  [/\u200B([\u1022-\u1030\u1032-\u103B\u103D-\u104F])$/, "$1"],
﻿  ﻿  ﻿  ﻿  ﻿  [/ေြ([က-အ])$/, "$1ြေ\u200B"],
﻿  ﻿  ﻿  ﻿  ﻿  [/([ေြ])([က-အ])$/, "$2$1\u200B"],
﻿  ﻿  ﻿  ﻿  ﻿  [/([ေြ])([ွှ])$/, "$2$1"],
﻿  ﻿  ﻿  ﻿  ﻿  [/ံု$/, "ုံ"]
﻿  ﻿  ﻿  ﻿  ]

﻿  ﻿  ﻿  }

﻿  ﻿  }
﻿  },
﻿  

﻿  /**
﻿   * Knayi build likely jQuery, but Knayi will not use CSS selector.
﻿   * 
﻿   * @param {Element|HTMLCollection|jQuery Object} elem
﻿   * @param {object} options
﻿   * @return {kanyi object}
﻿   */
﻿  knayi = function( elem, options ) {
﻿  ﻿  return new knayi.fn.init( elem, options );
﻿  };

﻿  knayi.fn = knayi.prototype = {

﻿  ﻿  knayi: core_version,

﻿  ﻿  constructor: knayi,

﻿  ﻿  // Initialize and return jQuery like object
﻿  ﻿  init: function( elem, opts ) {

﻿  ﻿  ﻿  var i = 0;
﻿  ﻿  ﻿  opts = opts || {};
﻿  ﻿  ﻿  this.downToTextNode = opts.downToTextNode || false;
﻿  ﻿  ﻿  
﻿  ﻿  ﻿  if ( !elem ) return this;
﻿  ﻿  ﻿  
﻿  ﻿  ﻿  // Mapping Element Node
﻿  ﻿  ﻿  if ( elem.nodeType ) {

﻿  ﻿  ﻿  ﻿  this[0] = elem;
﻿  ﻿  ﻿  ﻿  // Crate knyData for Reference
﻿  ﻿  ﻿  ﻿  if( !this[0].knyData ) this[0].knyData = {};
﻿  ﻿  ﻿  ﻿  if(this[0].attributes === null) { //<<<<<<<<<<<<<<< for #text node this can cause error of undefined when calling getAttribute()
﻿  ﻿  ﻿  ﻿  ﻿  this[0].knyData.fontType = opts.fontType ||
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  ﻿  ﻿  ﻿  ﻿  this[0].knyData.fontType || undefined;
﻿  ﻿  ﻿  ﻿  } else {
﻿  ﻿  ﻿  ﻿  ﻿  this[0].knyData.fontType = opts.fontType ||
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  ﻿  ﻿  ﻿  ﻿  this[0].knyData.fontType ||
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  ﻿  ﻿  ﻿  ﻿  fontTypes[this[0].getAttribute('data-kny-fontType')] || undefined;
﻿  ﻿  ﻿  ﻿  }
﻿  ﻿  ﻿  ﻿  
﻿  ﻿  ﻿  ﻿  this.length = 1;

﻿  ﻿  ﻿  } else if ( knayi.isCollection(elem) ) {

﻿  ﻿  ﻿  ﻿  for (; i < elem.length; i++) {
﻿  ﻿  ﻿  ﻿  ﻿  this[i] = elem[i];
﻿  ﻿  ﻿  ﻿  ﻿  // Crate knyData for Reference
﻿  ﻿  ﻿  ﻿  ﻿  if( !this[0].knyData ) this[0].knyData = {};
﻿  ﻿  ﻿  ﻿  ﻿  if(this[0].attributes === null) { //<<<<<<<<<<<<<<< for #text node this can cause error of undefined when calling getAttribute()
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  this[i].knyData.fontType = opts.fontType ||
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  ﻿  ﻿  ﻿  ﻿  ﻿  this[i].knyData.fontType || undefined;
﻿  ﻿  ﻿  ﻿  ﻿  } else {
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  this[i].knyData.fontType = opts.fontType ||
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  ﻿  ﻿  ﻿  ﻿  ﻿  this[i].knyData.fontType ||
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  ﻿  ﻿  ﻿  ﻿  ﻿  fontTypes[this[i].getAttribute('data-kny-fontType')] || undefined;
﻿  ﻿  ﻿  ﻿  ﻿  }
﻿  ﻿  ﻿  ﻿  };
﻿  ﻿  ﻿  ﻿  this.length = i;

﻿  ﻿  ﻿  }

﻿  ﻿  ﻿  return this;
﻿  ﻿  },

﻿  ﻿  each: function( callback, args ) {
﻿  ﻿  ﻿  return knayi.each( this, callback, args );
﻿  ﻿  }
﻿  };

﻿  knayi.fn.init.prototype = knayi.fn;

﻿  /**
﻿   * Define Knayi as a extensible object
﻿   */
﻿  knayi.extend = knayi.fn.extend = function() {

﻿  ﻿  var target = arguments[0] || {},
﻿  ﻿  ﻿  i = 1, name, arg,
﻿  ﻿  ﻿  length = arguments.length;

﻿  ﻿  if ( length === i ) {
﻿  ﻿  ﻿  target = this;
﻿  ﻿  ﻿  --i;
﻿  ﻿  }

﻿  ﻿  for ( ; i < length; i++ ) {
﻿  ﻿  ﻿  if ( ( arg = arguments[i] ) != null ) {
﻿  ﻿  ﻿  ﻿  for ( name in arg ) {
﻿  ﻿  ﻿  ﻿  ﻿  target[ name ] = arg[ name ];
﻿  ﻿  ﻿  ﻿  }
﻿  ﻿  ﻿  }
﻿  ﻿  };

﻿  ﻿  return target;
﻿  };

﻿  /**
﻿   * Extending Utility
﻿   */
﻿  knayi.extend({

﻿  ﻿  // String trim
﻿  ﻿  trim: core_version.trim ?
﻿  ﻿  ﻿  function ( text ) {
﻿  ﻿  ﻿  ﻿  return text.trim();
﻿  ﻿  ﻿  }:
﻿  ﻿  ﻿  function( text ) {
﻿  ﻿  ﻿  ﻿  return text.replace( rtrim, "" );
﻿  ﻿  ﻿  },

﻿  ﻿  // Internal Use Each method
﻿  ﻿  each: function ( obj, callback, args ) {

﻿  ﻿  ﻿  var i = 0,
﻿  ﻿  ﻿  ﻿  length = obj.length,
﻿  ﻿  ﻿  ﻿  type = ( core_obj.toString.call( obj ) == "[object Array]" && obj != window),
﻿  ﻿  ﻿  ﻿  value;

﻿  ﻿  ﻿  if ( args ) {
﻿  ﻿  ﻿  ﻿  if ( type || typeof length == 'number' ) {

﻿  ﻿  ﻿  ﻿  ﻿  for ( ; i < length; i++ ) {
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  value = callback.apply( obj[i], args );

﻿  ﻿  ﻿  ﻿  ﻿  ﻿  if ( value === false ) break;
﻿  ﻿  ﻿  ﻿  ﻿  };
﻿  ﻿  ﻿  ﻿  } else  {
﻿  ﻿  ﻿  ﻿  ﻿  for ( i in obj ) {
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  value = callback.apply( obj[i], args );

﻿  ﻿  ﻿  ﻿  ﻿  ﻿  if ( value === false ) break;
﻿  ﻿  ﻿  ﻿  ﻿  }
﻿  ﻿  ﻿  ﻿  }
﻿  ﻿  ﻿  } else  {
﻿  ﻿  ﻿  ﻿  if ( type || typeof length == 'number' ) {
﻿  ﻿  ﻿  ﻿  ﻿  for ( ; i < length; i++ ) {
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  value = callback.call( obj[i], obj[i], i, obj );

﻿  ﻿  ﻿  ﻿  ﻿  ﻿  if ( value === false ) break;
﻿  ﻿  ﻿  ﻿  ﻿  };
﻿  ﻿  ﻿  ﻿  } else  {
﻿  ﻿  ﻿  ﻿  ﻿  for ( i in obj ) {
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  value = callback.call( obj[i], obj[i], i, obj );

﻿  ﻿  ﻿  ﻿  ﻿  ﻿  if ( value === false ) break;
﻿  ﻿  ﻿  ﻿  ﻿  }
﻿  ﻿  ﻿  ﻿  }
﻿  ﻿  ﻿  }

﻿  ﻿  ﻿  return obj;

﻿  ﻿  },

﻿  ﻿  /**
﻿  ﻿   * Getting text of direct child of #text nodes
﻿  ﻿   * "*$" will add between each node
﻿  ﻿   *
﻿  ﻿   * @param {Element} elem
﻿  ﻿   * @return {String}
﻿  ﻿   */
﻿  ﻿  justText: function( elem ) {

﻿  ﻿  ﻿  if ( elem == null || !elem.nodeType ) return false;
﻿  ﻿  ﻿  if ( elem.nodeType === 3 ) return elem.nodeValue; //<<<<<<<<<<< return elem.nodeValue instead of elem.value

﻿  ﻿  ﻿  var text = "",
﻿  ﻿  ﻿  ﻿  i = 0,
﻿  ﻿  ﻿  ﻿  childNodes = elem.childNodes;

﻿  ﻿  ﻿  for ( ; i < childNodes.length; i++ ) {
﻿  ﻿  ﻿  ﻿  if ( childNodes[i].nodeType === 3 && childNodes[i].nodeValue != null ) {
﻿  ﻿  ﻿  ﻿  ﻿  text += "*$" + knayi.trim(childNodes[i].nodeValue);
﻿  ﻿  ﻿  ﻿  }
﻿  ﻿  ﻿  };

﻿  ﻿  ﻿  return text.replace(/\*\$/, '');

﻿  ﻿  },

﻿  ﻿  /**
﻿  ﻿   * Just text replacer 
﻿  ﻿   * "*$" break point can use to Separate #text nodes
﻿  ﻿   *
﻿  ﻿   * @param {Element} elem
﻿  ﻿   * @param {String} text
﻿  ﻿   * @return {Element} Changed element
﻿  ﻿   */
﻿  ﻿  textReplace: function( elem, text ){

﻿  ﻿  ﻿  if ( elem == null || !elem.nodeType ) return false;
﻿  ﻿  ﻿  if ( elem.nodeType === 3 ) elem.nodeValue = text;
﻿  ﻿  ﻿  
﻿  ﻿  ﻿  var i = 0,
﻿  ﻿  ﻿  ﻿  textContents = text.split("*$"),
﻿  ﻿  ﻿  ﻿  childNodes = elem.childNodes;﻿  ﻿  


﻿  ﻿  ﻿  // Replacing each contents to each #text nodes
﻿  ﻿  ﻿  for ( ; i < childNodes.length; i++ ) {
﻿  ﻿  ﻿  ﻿  if ( childNodes[i].nodeType === 3 && childNodes[i].nodeValue != null ) {
﻿  ﻿  ﻿  ﻿  ﻿  childNodes[i].nodeValue = textContents.shift(1);
﻿  ﻿  ﻿  ﻿  }
﻿  ﻿  ﻿  };

﻿  ﻿  ﻿  // Over contents will be join and add as new #text node
﻿  ﻿  ﻿  if ( textContents.length > 0 ) {
﻿  ﻿  ﻿  ﻿  if ( elem.nodeType === 3 ) { //<<<<<<<<<<<<<< added conditional check for #text node which cannot contains childNode
﻿  ﻿  ﻿  ﻿  ﻿  elem.nodeValue = textContents.join(' ');
﻿  ﻿  ﻿  ﻿  } else {
﻿  ﻿  ﻿  ﻿  ﻿  var textNode = document.createTextNode( textContents.join(' ') );
﻿  ﻿  ﻿  ﻿  ﻿  elem.appendChild(textNode);
﻿  ﻿  ﻿  ﻿  }
﻿  ﻿  ﻿  }

﻿  ﻿  ﻿  return elem;

﻿  ﻿  },

﻿  ﻿  // Detecting jQuery, HTMLCollection or element array
﻿  ﻿  isCollection: function( obj ){
﻿  ﻿  ﻿  var length = obj.length;

﻿  ﻿  ﻿  if ( obj.jquery && obj.length > 0 ) return true;
﻿  ﻿  ﻿  if ( obj == null ) return false;
﻿  ﻿  ﻿  if ( obj == global ) return false;
﻿  ﻿  ﻿  if ( obj.nodeType === 1 && length ) return true;

﻿  ﻿  ﻿  return core_obj.toString.call(obj) == "[object HTMLCollection]" || ( ( length === 0 ||
﻿  ﻿  ﻿  typeof length === "number" && length > 0 && ( length - 1 ) in obj ) &&
﻿  ﻿  ﻿  typeof obj[0].nodeType == "number");

﻿  ﻿  },

﻿  ﻿  /**
﻿  ﻿   * Cursor Index Finder
﻿  ﻿   *
﻿  ﻿   * @param {Input|Textarea|contenteditable} elem
﻿  ﻿   * @return index of position of cursor
﻿  ﻿   */
﻿  ﻿  cursor: function ( elem ) {

﻿  ﻿  ﻿  var cursor = 0, os;
﻿  ﻿  ﻿  if ( document.selection ) {
﻿  ﻿  ﻿  ﻿  elem.focus();
﻿  ﻿  ﻿  ﻿  os = document.selection.createRange();
﻿  ﻿  ﻿  ﻿  os.moveStart('character', -elem.value.length);
﻿  ﻿  ﻿  ﻿  cursor = os.text.length;
﻿  ﻿  ﻿  } else if ( elem.selectionStart || elem.selectionStart == '0' ) {
﻿  ﻿  ﻿  ﻿  cursor = elem.selectionStart;
﻿  ﻿  ﻿  } else if ( window.getSelection ) {
﻿  ﻿  ﻿  ﻿  os = window.getSelection();
﻿  ﻿  ﻿  ﻿  if ( os.rangeCount ) {
﻿  ﻿  ﻿  ﻿  ﻿  range = os.getRangeAt(0);
﻿  ﻿  ﻿  ﻿  ﻿  cursor = range.endOffset;
﻿  ﻿  ﻿  ﻿  }
﻿  ﻿  ﻿  }
﻿  ﻿  ﻿  return (cursor);

﻿  ﻿  },

﻿  ﻿  /**
﻿  ﻿   * Set Cursor to Specific Index
﻿  ﻿   *
﻿  ﻿   * @param {Input|Textarea|contenteditable} elem
﻿  ﻿   * @param {Number} _start start index
﻿  ﻿   * @param {Number} _end end index
﻿  ﻿   * @return {Element} Changed element
﻿  ﻿   */
﻿  ﻿  setCursor: function ( elem, _start, _end ) {

﻿  ﻿  ﻿  if ( elem.setSelectionRange ) {
﻿  ﻿  ﻿  ﻿  elem.setSelectionRange(_start, _end);
﻿  ﻿  ﻿  } else {
﻿  ﻿  ﻿  ﻿  var range = document.createRange();
﻿  ﻿  ﻿  ﻿  var sel = window.getSelection();
﻿  ﻿  ﻿  ﻿  range.setStart(elem, _start);
﻿  ﻿  ﻿  ﻿  range.collapse(true);
﻿  ﻿  ﻿  ﻿  sel.removeAllRanges();
﻿  ﻿  ﻿  ﻿  sel.addRange(range);
﻿  ﻿  ﻿  }

﻿  ﻿  ﻿  return elem;

﻿  ﻿  }

﻿  });

﻿  /**
﻿   * Extend Stand-alone Language Utility Functions
﻿   * All stand-alone functions can use like
﻿   * knayi[Function Name]
﻿   */
﻿  knayi.extend({

﻿  ﻿  /**
﻿  ﻿   * Font Detector agent
﻿  ﻿   * @param {String} content
﻿  ﻿   * @return {Array} result will include detected data
﻿  ﻿   */
﻿  ﻿  fontDetect: function( content ) {

﻿  ﻿  ﻿  var result = [],
﻿  ﻿  ﻿  ﻿  // Trim and Remove break points "\u200B"
﻿  ﻿  ﻿  ﻿  text = knayi.trim(content).replace(/\u200B/g, ''),
﻿  ﻿  ﻿  ﻿  lib = library.detect,
﻿  ﻿  ﻿  ﻿  copy, font, match;

﻿  ﻿  ﻿  // Loop and Search Match on Library
﻿  ﻿  ﻿  for ( font in lib ) {

﻿  ﻿  ﻿  ﻿  var t = 0, j = 0;
﻿  ﻿  ﻿  ﻿  copy = lib[ font ];
﻿  ﻿  ﻿  ﻿  
﻿  ﻿  ﻿  ﻿  for (; j < copy.length; j++ ) {
﻿  ﻿  ﻿  ﻿  ﻿  if ( ( match = text.match( copy[j] ) ) ) t += match.length || 0;
﻿  ﻿  ﻿  ﻿  };

﻿  ﻿  ﻿  ﻿  result.push( { type: font, matchTime: t } );

﻿  ﻿  ﻿  }

﻿  ﻿  ﻿  // Sort most possible first
﻿  ﻿  ﻿  result.sort(function(a,b){
﻿  ﻿  ﻿  ﻿  if(a.matchTime < b.matchTime)
﻿  ﻿  ﻿  ﻿  ﻿  return 1;
﻿  ﻿  ﻿  ﻿  if(a.matchTime > b.matchTime)
﻿  ﻿  ﻿  ﻿  ﻿  return -1;
﻿  ﻿  ﻿  ﻿  return 0;
﻿  ﻿  ﻿  });

﻿  ﻿  ﻿  return result;

﻿  ﻿  },

﻿  ﻿  /**
﻿  ﻿   * Font Converter agent
﻿  ﻿   *
﻿  ﻿   * @param {String} text content
﻿  ﻿   * @param {String} which font to convert. Default: "unicode5";
﻿  ﻿   * @param {String}[Option] give current font type
﻿  ﻿   * ﻿  ﻿  without "form" knayi will first detect what font it's!
﻿  ﻿   * @return {String} converted text
﻿  ﻿   */
﻿  ﻿  fontConvert: function( content, to, from ) {

﻿  ﻿  ﻿  // Trim and Remove break points "\u200B"
﻿  ﻿  ﻿  var text = knayi.trim(content).replace(/\u200B/, ''),
﻿  ﻿  ﻿  ﻿  detect, dlib, sourceLib;
﻿  
﻿  ﻿  ﻿  if(content === "") { //<<<<<<<<<<<<<<< added this to skip content check. otherwise console will print "Convert target font and current font are same"
﻿  ﻿  ﻿  ﻿  return content;
﻿  ﻿  ﻿  }
﻿  ﻿  ﻿  // Redefining Font Types
﻿  ﻿  ﻿  to = fontTypes[ to || 'unicode5' ];
﻿  ﻿  ﻿  from = fontTypes[ from || ( detect = this.fontDetect( text )[0] ).type ];

﻿  ﻿  ﻿  // Return when font detected fail
﻿  ﻿  ﻿  if ( !from && detect && detect.matchTime < 1 ){
﻿  ﻿  ﻿  ﻿  console.error("Not match with any fonts");
﻿  ﻿  ﻿  ﻿  return content;
﻿  ﻿  ﻿  }
﻿  ﻿  ﻿  // Return when Target font and Current font are same type
﻿  ﻿  ﻿  if ( from == to ){
﻿  ﻿  ﻿  ﻿  console.error("Convert target font and current font are same");
﻿  ﻿  ﻿  ﻿  return content;
﻿  ﻿  ﻿  }

﻿  ﻿  ﻿  /* Library Searching
﻿  ﻿  ﻿   * If direct library not found, Knayi will find 2 level library
﻿  ﻿  ﻿   */
﻿  ﻿  ﻿  if ( ( dlib = library.convert[from] ) ){

﻿  ﻿  ﻿  ﻿  // Searching extensible library!
﻿  ﻿  ﻿  ﻿  if ( !dlib[to] ){

﻿  ﻿  ﻿  ﻿  ﻿  var rlib;
﻿  ﻿  ﻿  ﻿  ﻿  var font;

﻿  ﻿  ﻿  ﻿  ﻿  for( font in dlib ) {
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  if( library.convert[font] && library.convert[font][to] ) rlib = font;
﻿  ﻿  ﻿  ﻿  ﻿  }
﻿  ﻿  ﻿  ﻿  ﻿  
﻿  ﻿  ﻿  ﻿  ﻿  // Return when no more convertible library found
﻿  ﻿  ﻿  ﻿  ﻿  if( !rlib ) {
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  console.error('Non convertible library found');
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  return content;
﻿  ﻿  ﻿  ﻿  ﻿  }

﻿  ﻿  ﻿  ﻿  ﻿  text = knayi.fontConvert( text, font, from );
﻿  ﻿  ﻿  ﻿  ﻿  dlib = library.convert[font];

﻿  ﻿  ﻿  ﻿  }

﻿  ﻿  ﻿  ﻿  // Return converted text content
﻿  ﻿  ﻿  ﻿  return util.convert( text, dlib, to );

﻿  ﻿  ﻿  } else {
﻿  ﻿  ﻿  ﻿  // Return library not found!
﻿  ﻿  ﻿  ﻿  console.error('Non convertible library found');
﻿  ﻿  ﻿  ﻿  return content;
﻿  ﻿  ﻿  }
﻿  ﻿  ﻿  
﻿  ﻿  },

﻿  ﻿  /**
﻿  ﻿   * Syllable-Break agent
﻿  ﻿   *
﻿  ﻿   * @param {String} text content
﻿  ﻿   * @param {String} language of content
﻿  ﻿   * @return {String} edited text content
﻿  ﻿   */
﻿  ﻿  syllbreak: function( text, language ){

﻿  ﻿  ﻿  // Detect font when language is not given
﻿  ﻿  ﻿  var lang = language || knayi.fontDetect( text );

﻿  ﻿  ﻿  // Return when not match with any language
﻿  ﻿  ﻿  if( !language && lang[0].matchTime < 1 ) return text;
﻿  ﻿  ﻿  else if ( !language ) lang = lang[0].type;
﻿  ﻿  ﻿  
﻿  ﻿  ﻿  lang = fontType2Lang[ lang ];

﻿  ﻿  ﻿  var lib = library.syllable[lang];

﻿  ﻿  ﻿  if ( lib ) {
﻿  ﻿  ﻿  ﻿  for (var i = 0; i < lib.length; i++) {
﻿  ﻿  ﻿  ﻿  ﻿  text = text.replace(lib[i][0], lib[i][1]);
﻿  ﻿  ﻿  ﻿  };
﻿  ﻿  ﻿  };

﻿  ﻿  ﻿  return text;

﻿  ﻿  },

﻿  ﻿  /**
﻿  ﻿   * Knayi Keyboard Event
﻿  ﻿   * 
﻿  ﻿   * @param {Element} elem
﻿  ﻿   * @param {ON|OFF} keyboard switch
﻿  ﻿   * @param {String} name of keyboard
﻿  ﻿   */
﻿  ﻿  keyboard: function( elem, on, type ) {

﻿  ﻿  ﻿  console.log(elem)

﻿  ﻿  ﻿  if ( !elem.knyData ) elem.knyData = {};
﻿  ﻿  ﻿  if ( type ){
﻿  ﻿  ﻿  ﻿  if ( typeof library.keyboards[type] !== "undefined" ){
﻿  ﻿  ﻿  ﻿  ﻿  elem.knyData.keyboard = { type: type, status: (on || false) };
﻿  ﻿  ﻿  ﻿  }
﻿  ﻿  ﻿  }

﻿  ﻿  ﻿  if( on ){
﻿  ﻿  ﻿  ﻿  if (typeof elem.addEventListener !== 'undefined' ) elem.addEventListener('keypress', util.keyBoard, false );
﻿  ﻿  ﻿  ﻿  else if (typeof elem.attachEvent !== 'undefined' ) elem.attachEvent('onkeypress', util.keyBoard, false );
﻿  ﻿  ﻿  } else {
﻿  ﻿  ﻿  ﻿  if (typeof elem.removeEventListener !== 'undefined' ) elem.removeEventListener('keypress', util.keyBoard, false );
﻿  ﻿  ﻿  ﻿  else if (typeof elem.detachEvent !== 'undefined' ) elem.detachEvent('onkeypress', util.keyBoard, false );
﻿  ﻿  ﻿  }

﻿  ﻿  }

﻿  });

﻿  // Extend Language Utility For Each knayi Object
﻿  knayi.fn.extend({

﻿  ﻿  // Add 'unstable = true' for watch changes of that nodes
﻿  ﻿  // callback( [ { fontType: [element, element2]} ] );
﻿  ﻿  fontDetect: function( unstable, callback ){
﻿  ﻿  ﻿  var i = 0,
﻿  ﻿  ﻿  ﻿  result = {};

﻿  ﻿  ﻿  for (; i < this.length; i++) {

﻿  ﻿  ﻿  ﻿  // Adding unstable status
﻿  ﻿  ﻿  ﻿  if ( unstable ) this[i].knyData.unstable = true;
﻿  ﻿  ﻿  ﻿  else this[i].knyData.unstable = false;

﻿  ﻿  ﻿  ﻿  // Reduce work for fontType set elements
﻿  ﻿  ﻿  ﻿  if ( !this[i].knyData.unstable && this[i].knyData && this[i].knyData.fontType ) continue;

﻿  ﻿  ﻿  ﻿  var detect = knayi.fontDetect( this[i].nodeName.match(rInputs) ? this[i].value :
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  ﻿  ﻿  knayi.justText( this[i] ) );

﻿  ﻿  ﻿  ﻿  var type = this[i].knyData.fontType = detect[0].matchTime > 0 ? detect[0].type : undefined;

﻿  ﻿  ﻿  ﻿  // add to "data-kny-fontType" data attribute
﻿  ﻿  ﻿  ﻿  this[i].setAttribute( 'data-kny-fontType', type );

﻿  ﻿  ﻿  }
﻿  ﻿  ﻿  // Return result of element arrays
﻿  ﻿  ﻿  if( callback ) callback( detect );
﻿  ﻿  ﻿  return this;

﻿  ﻿  },

﻿  ﻿  // Converting element #text nodes values
﻿  ﻿  fontConvert: function( to, from ) {

﻿  ﻿  ﻿  var i = 0;

﻿  ﻿  ﻿  if ( !to ) throw new Error( 'No selected font for convert' );

﻿  ﻿  ﻿  for (; i < this.length; i++) {
﻿  ﻿  ﻿  ﻿  var isInput = this[i].nodeName.match(rInputs);
﻿  ﻿  ﻿  ﻿  ﻿  f = from;
﻿  ﻿  ﻿  ﻿  ﻿  $text = isInput ? this[i].value :
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  ﻿  knayi.justText( this[i] );

﻿  ﻿  ﻿  ﻿  if( !f ) f = this[i].knyData.fontType;

﻿  ﻿  ﻿  ﻿  if( this.downToTextNode ){
﻿  ﻿  ﻿  ﻿  ﻿  // Split each #text node by "*$"
﻿  ﻿  ﻿  ﻿  ﻿  var j = 0,
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  textNodes = $text.split('*$'),
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  converted = [];
﻿  ﻿  ﻿  ﻿  ﻿  //<<<<<<<<<<<<<<< rename variable 'i' to 'j'. otherwise the system will confused with the variable 'i' declare earlier outside this if block
﻿  ﻿  ﻿  ﻿  ﻿  // ﻿  ﻿  ﻿  ﻿    and accessing this[i] outside this block may cause undefined error

﻿  ﻿  ﻿  ﻿  ﻿  for (; j < textNodes.length; j++) {
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  converted.push( knayi.fontConvert( textNodes[j], to ) );
﻿  ﻿  ﻿  ﻿  ﻿  }

﻿  ﻿  ﻿  ﻿  ﻿  $text = converted.join('*$');

﻿  ﻿  ﻿  ﻿  }else {
﻿  ﻿  ﻿  ﻿  ﻿  $text = knayi.fontConvert( $text, to , f );﻿  
﻿  ﻿  ﻿  ﻿  }

﻿  ﻿  ﻿  ﻿  if( isInput ) this[i].value = $text;
﻿  ﻿  ﻿  ﻿  else knayi.textReplace( this[i], $text );

﻿  ﻿  ﻿  ﻿  // adding font type
﻿  ﻿  ﻿  ﻿  this[i].knyData.fontType = to;

﻿  ﻿  ﻿  }

﻿  ﻿  ﻿  return this;

﻿  ﻿  },

﻿  ﻿  // Adding syllable break point on element #text nodes
﻿  ﻿  syllbreak: function( langauge ){

﻿  ﻿  ﻿  var i = 0;

﻿  ﻿  ﻿  for (var i = 0; i < this.length; i++) {
﻿  ﻿  ﻿  ﻿  var isInput = this[i].nodeName.match(rInputs);
﻿  ﻿  ﻿  ﻿  ﻿  lang = langauge || this[i].knyData.fontType;
﻿  ﻿  ﻿  ﻿  ﻿  $text = isInput ? this[i].value :
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  ﻿  knayi.justText( this[i] );

﻿  ﻿  ﻿  ﻿  $text = knayi.syllbreak( $text, lang );

﻿  ﻿  ﻿  ﻿  if( isInput ) this[i].value = $text;
﻿  ﻿  ﻿  ﻿  else knayi.textReplace( $text );

﻿  ﻿  ﻿  };

﻿  ﻿  ﻿  return this;

﻿  ﻿  }

﻿  });

﻿  global.knayi = global.kny = knayi;


﻿  /**
﻿   * Internal Utility Functions
﻿   */
﻿  var util = {

﻿  ﻿  // Find line with RegExp, Use in finding error
﻿  ﻿  lineFinder: function( text, rex ) {
﻿  ﻿  ﻿  var lines = text.split('\n'),
﻿  ﻿  ﻿  ﻿  exc,
﻿  ﻿  ﻿  ﻿  i = 0;
﻿  ﻿  ﻿  
﻿  ﻿  ﻿  for (; i < lines.length; i++) {
﻿  ﻿  ﻿  ﻿  if( ( exc = rex.exec(lines[i]) ) ){
﻿  ﻿  ﻿  ﻿  ﻿  return { 
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  lineNumber: i + 1,
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  indexOfLine: exc.index,
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  line: lines[i],
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  exc: exc 
﻿  ﻿  ﻿  ﻿  ﻿  };
﻿  ﻿  ﻿  ﻿  ﻿  break;
﻿  ﻿  ﻿  ﻿  }
﻿  ﻿  ﻿  };

﻿  ﻿  ﻿  return false;

﻿  ﻿  },

﻿  ﻿  // Check and replace unwanted spelling error on converting font
﻿  ﻿  // Supported font-types: unicode5, zawgyi
﻿  ﻿  spellChecker: function( text, fontType ){

﻿  ﻿  ﻿  var $text = text, i = 0,
﻿  ﻿  ﻿  ﻿  rxc,line,match,
﻿  ﻿  ﻿  ﻿  result = [];

﻿  ﻿  ﻿  switch( fontType ){

﻿  ﻿  ﻿  ﻿  case 'unicode5':

﻿  ﻿  ﻿  ﻿  ﻿  var dbreg = "ါ ာ ိ ီ ု ူ ေ ဲ ံ ့ း ် ျ ြ ွ ှ ္".split(" ");

﻿  ﻿  ﻿  ﻿  ﻿  for (; i < dbreg.length; i++) {

﻿  ﻿  ﻿  ﻿  ﻿  ﻿  rxc = new RegExp(dbreg[i]+"{2,}");

﻿  ﻿  ﻿  ﻿  ﻿  ﻿  while( (  match = rxc.exec( $text ) ) ) {
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  ﻿  result.push( [ match[0], match.index ] );
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  ﻿  $text = $text.replace(rxc, dbreg[i]);
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  }

﻿  ﻿  ﻿  ﻿  ﻿  }

﻿  ﻿  ﻿  ﻿  ﻿  // return result and edited text
﻿  ﻿  ﻿  ﻿  ﻿  return {result: result, text: $text};
﻿  ﻿  ﻿  ﻿  ﻿  break;
﻿  ﻿  ﻿  ﻿  case 'zawgyi':

﻿  ﻿  ﻿  ﻿  ﻿  var dbreg = "ါ ာ ိ ီ ု ူ ေ ဲ ဳ ဴ ံ ့ း ္ ် ျ ြ ွ ၚ ၠ ၡ ၢ ၣ ၤ ၥ ၦ ၧ ၨ ၩ ၪ ၫ ၬ ၭ ၰ ၱ ၲ ၳ ၴ ၵ ၶ ၷ ၸ ၹ ၺ ၻ ၼ ၽ ၾ ၿ ႀ ႁ ႂ ႃ ႄ ႅ ႇ ႈ ႉ ႊ ႋ ႌ ႍ ႎ ႓ ႔ ႕ ႖".split(" ");

﻿  ﻿  ﻿  ﻿  ﻿  for (; i < dbreg.length; i++) {

﻿  ﻿  ﻿  ﻿  ﻿  ﻿  rxc = new RegExp(dbreg[i]+"{2,}");

﻿  ﻿  ﻿  ﻿  ﻿  ﻿  while( (  match = rxc.exec( $text ) ) ) {
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  ﻿  result.push( [ match[0], match.index ] );
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  ﻿  $text = $text.replace(rxc, dbreg[i]);
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  }

﻿  ﻿  ﻿  ﻿  ﻿  }

﻿  ﻿  ﻿  ﻿  ﻿  // return result and edited text
﻿  ﻿  ﻿  ﻿  ﻿  return {result: result, text: $text};
﻿  ﻿  ﻿  ﻿  ﻿  break;
﻿  ﻿  ﻿  ﻿  default:
﻿  ﻿  ﻿  ﻿  ﻿  return {result: [], text: $text};
﻿  ﻿  ﻿  ﻿  ﻿  break;
﻿  ﻿  ﻿  }

﻿  ﻿  ﻿  return false;
﻿  ﻿  ﻿  
﻿  ﻿  },

﻿  ﻿  // Converter with specific
﻿  ﻿  convert: function( $text, lib, to ){

﻿  ﻿  ﻿  var sourceLib = lib[to],
﻿  ﻿  ﻿  ﻿  i = 0, j = 0,
﻿  ﻿  ﻿  ﻿  copy;
﻿  ﻿  ﻿  ﻿  
﻿  ﻿  ﻿  // Replace Single loop RegExp
﻿  ﻿  ﻿  for (; i < sourceLib.singleReplace.length; i++ ) {
﻿  ﻿  ﻿  ﻿  $text = $text.replace( sourceLib.singleReplace[i][0], sourceLib.singleReplace[i][1] );
﻿  ﻿  ﻿  }
﻿  ﻿  ﻿  
﻿  ﻿  ﻿  // Spelling check prevent endless loop!
﻿  ﻿  ﻿  $text = util.spellChecker( $text, to ).text;

﻿  ﻿  ﻿  for (; j < sourceLib.whileReplace.length; j++) {
﻿  ﻿  ﻿  ﻿  copy = sourceLib.whileReplace[j];
﻿  ﻿  ﻿  ﻿  while( $text.match(copy[0]) ) {
﻿  ﻿  ﻿  ﻿  ﻿  $text = $text.replace( copy[0], copy[1] );
﻿  ﻿  ﻿  ﻿  }

﻿  ﻿  ﻿  }

﻿  ﻿  ﻿  return $text;

﻿  ﻿  },

﻿  ﻿  // Knayi Keyboard is a keypress event function
﻿  ﻿  // Use Internal only
﻿  ﻿  keyBoard: function( event ) {
﻿  ﻿  ﻿  
﻿  ﻿  ﻿  var typed = String.fromCharCode( event.charCode ),
﻿  ﻿  ﻿  ﻿  lib = library.keyboards[this.knyData.keyboard.type],
﻿  ﻿  ﻿  ﻿  ce = false,
﻿  ﻿  ﻿  ﻿  fixed = false,
﻿  ﻿  ﻿  ﻿  target;

﻿  ﻿  ﻿  // Prevent from shortcut key typing
﻿  ﻿  ﻿  if ( event.ctrlKey || event.altKey ) return;

﻿  ﻿  ﻿  // set target depending on contenteditable element or input element
﻿  ﻿  ﻿  if ( ( ce = this.getAttribute("contenteditable") ) ) target = event.target;
﻿  ﻿  ﻿  else target = this;

﻿  ﻿  ﻿  var cursor = knayi.cursor( target ),
﻿  ﻿  ﻿  ﻿  // Start Index record for replacing value
﻿  ﻿  ﻿  ﻿  _sIndex = cursor,
﻿  ﻿  ﻿  ﻿  // old value on target element
﻿  ﻿  ﻿  ﻿  value = ce ? target.nodeValue : target.value,
﻿  ﻿  ﻿  ﻿  // value to current Index position
﻿  ﻿  ﻿  ﻿  v2pos = value.substr(0, _sIndex),
﻿  ﻿  ﻿  ﻿  fORT, match, k = -1, i = 0

﻿  ﻿  ﻿  // Replace by enBase Keyboard
﻿  ﻿  ﻿  if ( ( k = lib.keyfix.from.indexOf( typed ) ) > -1 ){
﻿  ﻿  ﻿  ﻿  fixed = v2pos + lib.keyfix.to[k];
﻿  ﻿  ﻿  }

﻿  ﻿  ﻿  fORt = fixed || v2pos + typed;

﻿  ﻿  ﻿  for (; i < lib.rexfix.length; i++) {
﻿  ﻿  ﻿  ﻿  if ( ( match = fORt.match(lib.rexfix[i][0]) ) ) {
﻿  ﻿  ﻿  ﻿  ﻿  _sIndex = match.index;
﻿  ﻿  ﻿  ﻿  ﻿  fORt = fORt.replace( lib.rexfix[i][0], lib.rexfix[i][1] );
﻿  ﻿  ﻿  ﻿  }
﻿  ﻿  ﻿  };

﻿  ﻿  ﻿  if ( fORt !== v2pos + typed ) fixed = fORt;

﻿  ﻿  ﻿  // RegExp fix
﻿  ﻿  ﻿  if( fixed ) {
﻿  ﻿  ﻿  ﻿  var pos = _sIndex + fixed.length;
﻿  ﻿  ﻿  ﻿  event.preventDefault();

﻿  ﻿  ﻿  ﻿  if ( !ce ) target.value = fixed + value.substr(cursor);
﻿  ﻿  ﻿  ﻿  else target.nodeValue = fixed + value.substr(cursor);

﻿  ﻿  ﻿  ﻿  knayi.setCursor( target, pos, pos );
﻿  ﻿  ﻿  }

﻿  ﻿  }

﻿  };

}(this));

//utility function
//http://stackoverflow.com/questions/524696/how-to-create-a-style-tag-with-javascript
function appendCss(css, doc) {
﻿  var headElement = doc.head || doc.getElementsByTagName('head')[0],
﻿  ﻿  style = doc.createElement('style');
﻿  style.type = 'text/css';
﻿  if (style.styleSheet){
﻿    style.styleSheet.cssText = css;
﻿  } else {
﻿    style.appendChild(doc.createTextNode(css));
﻿  }
﻿  //style.innerHTML = css; //not tested in all browsers
﻿  headElement.appendChild(style);
}

//utility function
/*
var regexMM = new RegExp("[\u1000-\u109f\uaa60-\uaa7f]+");
var regexUni = new RegExp("[ဃငဆဇဈဉညဋဌဍဎဏဒဓနဘရဝဟဠအ]်|ျ[က-အ]ါ|ျ[ါ-း]|\u103e|\u103f|\u1031[^\u1000-\u1021\u103b\u1040\u106a\u106b\u107e-\u1084\u108f\u1090]|\u1031$|\u1031[က-အ]\u1032|\u1025\u102f|\u103c\u103d[\u1000-\u1001]|ည်း|ျင်း|င်|န်း|ျာ|င့်");
var regexZG = new RegExp("\s\u1031| ေ[က-အ]်|[က-အ]း");
var tagsSupported = ["DIV", "B", "SPAN", "INPUT", "SELECT", "TEXTAREA", "TABLE", "TR", "TD", "HEADER", "P", "FONT", "H1", "H2", "H3", "H4", "H5", "H6"];
function convert(node) {

﻿  if (tagsSupported.indexOf(node.nodeName) == -1) {
﻿  ﻿  return;
﻿  }
﻿  var text = node.textContent;
﻿  text = text.replace(/\n/g, "");
﻿  if (!regexMM.test(text)) {
﻿  ﻿  return;
﻿  }
﻿  if (text) {
﻿  ﻿  knayi(node).fontConvert("unicode5");
﻿  }
﻿  
}
*/

function convertZawgyiToUnicode(doc) {

﻿  var elems = doc.body.getElementsByTagName('*');
﻿  for (var i = 0; i < elems.length; i++) {
﻿  ﻿  var elem = elems[i];
﻿  ﻿  //convert(node);
﻿  ﻿  if (!elem.nodeName.match("SCRIPT|STYPE") && !elem.knyData && elem.nodeType === 1) {
﻿  ﻿  ﻿  var kElems = knayi(elem, {downToTextNode:true}).fontDetect();
﻿  ﻿  ﻿  if(kElems[0].knyData.fontType === "zawgyi") {
﻿  ﻿  ﻿  ﻿  kElems.fontConvert("unicode5", "zawgyi");
﻿  ﻿  ﻿  }
﻿  ﻿  ﻿  /*
﻿  ﻿  ﻿  font = fontDetect(justText(elem), true);
﻿  ﻿  ﻿  elem.knyDetected = font;
﻿  ﻿  ﻿  switch (text) {
﻿  ﻿  ﻿  ﻿  case "myanmar":
﻿  ﻿  ﻿  ﻿  ﻿  elem.style.fontFamily = unicodeFont;
﻿  ﻿  ﻿  ﻿  ﻿  break;
﻿  ﻿  ﻿  ﻿  case "zawgyi":
﻿  ﻿  ﻿  ﻿  ﻿  elem.style.fontFamily = zawgyiFont;
﻿  ﻿  ﻿  ﻿  ﻿  break
﻿  ﻿  ﻿  }
﻿  ﻿  ﻿  */
﻿  ﻿  }
﻿  }

}

function applyUnicodeFont(doc) {
﻿  //load font file
﻿  {
﻿  ﻿  var head = doc.head || doc.getElementsByTagName('head')[0];
﻿  ﻿  var fileref = doc.createElement('link');
﻿  ﻿  fileref.setAttribute('rel', 'stylesheet');
﻿  ﻿  fileref.setAttribute('type', 'text/css');
﻿  ﻿  fileref.setAttribute('href', 'http://mmwebfonts.comquas.com/fonts/?font=mon3');
﻿  ﻿  head.appendChild(fileref);
﻿  }
﻿  
﻿  //apply unicode font to all tags
﻿  {
﻿  ﻿  var css = "*{font-family:" + unicodeFont + " !important}";
﻿  ﻿  appendCss(css, doc);
﻿  }
﻿  
﻿  //convert zawgyi to unicode
﻿  {
﻿  ﻿  convertZawgyiToUnicode(doc);
﻿  ﻿  //observe changes to DOM tree and do conversion if necessary
﻿  ﻿  {
﻿  ﻿  ﻿  var observer = new window.MutationObserver(function (mutationRecords) {
﻿  ﻿  ﻿  ﻿  mutationRecords.forEach(function(mutationRecord) {
﻿  ﻿  ﻿  ﻿  ﻿  /*
﻿  ﻿  ﻿  ﻿  ﻿  convert(mutationRecord.target);
﻿  ﻿  ﻿  ﻿  ﻿  for(var i = 0; i < mutationRecord.addedNodes.length; i++) {
﻿  ﻿  ﻿  ﻿  ﻿  ﻿  convert(mutationRecord.addedNodes[i]);
﻿  ﻿  ﻿  ﻿  ﻿  }
﻿  ﻿  ﻿  ﻿  ﻿  */
﻿  ﻿  ﻿  ﻿  ﻿  convertZawgyiToUnicode(doc);
﻿  ﻿  ﻿  ﻿  });
﻿  ﻿  ﻿  });
﻿  ﻿  ﻿  var observerConfig = { childList: true, characterData: true, attributes: false, subtree: true };
﻿  ﻿  ﻿  observer.observe (doc.body, observerConfig);
﻿  ﻿  }
﻿  }
﻿  
﻿  //recursively apply unicode font to frames
﻿  {
﻿  ﻿  if(includeFrames) {
﻿  ﻿  ﻿  var frames = doc.getElementsByTagName('frame');
﻿  ﻿  ﻿  for (i = 0; i < frames.length; i++) {
﻿  ﻿  ﻿  ﻿  applyUnicodeFont(frames[i].contentDocument);
﻿  ﻿  ﻿  }
﻿  ﻿  }
﻿  }
}

(function(root) {

﻿  window.applyUnicodeFont(root);
﻿  alert('ok');
﻿  /*
﻿  window.setTimeout(function() {
﻿  ﻿  root.getElementById('aaa').innerHTML = 'ဘရာဇီးႏုိင္ငံအေျခစုိက္<div>ဘရာဇီးႏုိင္ငံအေျခစုိက္</div><div><div><div><div><div><p>ဗြိတိန်ပေါင် ၁၆ သန်းတန်တဲ့ ဆိုလာစွမ်းအင်သုံ</p></div></div></div></div></div>';
﻿  }, 1000);
﻿  */
﻿  
})(document);
