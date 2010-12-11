var resources_changed = true;
var newstart = true;

function getchilds(el,parent,tag) {
	var childs = el.childNodes;
	var only_text=true;
	var text=null;
	var isarray=false;
	if (parent[tag]) {
		// if a tag is not unique, make an array and add nodes to that
		isarray=true;
		if (!parent[tag][0]) {
			var old_val = parent[tag];
			parent[tag] = new Array();
			parent[tag].push(old_val);
		}
		parent[tag].push({});
	}
	else {parent[tag] = {};} // assume unique tag and make a assosiative node

	for (var i=0;i<childs.length;++i) {
		if (childs[i].nodeType==childs[i].ELEMENT_NODE ) {
			only_text=false;
			if (isarray) getchilds(childs[i], parent[tag][parent[tag].length-1], childs[i].nodeName);
			else getchilds(childs[i], parent[tag], childs[i].nodeName);
		}
		else if (childs[i].nodeType==childs[i].TEXT_NODE ) {
			text = childs[i].textContent;
		}
	}
	if (only_text) {
		if (isarray) parent[tag][parent[tag].length-1] = text;
		else parent[tag] = text;
	}
}

function isHTUrl(url) {
  if (url.search(/hattrick.org|hattrick.ws|hattrick.interia.ws/) == -1) return false;
  return true;
}


// get resources

// get prefrences
// if prefs not set in extension settings, get default values
if (localStorage["pref"] === undefined
	|| localStorage["pref"] == "") {
	// default prefs
	listUrl = chrome.extension.getURL("defaults/preferences/foxtrick.js");
	var prefxhr = new XMLHttpRequest();
	prefxhr.open("GET", listUrl, false);
	prefxhr.send();
	var preftext = prefxhr.responseText;
	preftext = preftext.replace(/(^|\n|\r)pref/g, "$1" + "user_pref");
}
else
	var preftext = localStorage["pref"];  // save prefs in extension settings

listUrl = chrome.extension.getURL("defaults/preferences/foxtrick.js");
var prefdefaultxhr = new XMLHttpRequest();
prefdefaultxhr.open("GET", listUrl, false);
prefdefaultxhr.send();

// get strings
listUrl = chrome.extension.getURL("content/foxtrick.properties");
var properties_defaultxhr = new XMLHttpRequest();
properties_defaultxhr.open("GET", listUrl, false);
properties_defaultxhr.send();

var session_lang ='en';
try {
	var propertiesxhr = new XMLHttpRequest();
	var string_regexp = new RegExp( 'user_pref\\("extensions.foxtrick.prefs.htLanguage","(.+)"\\);', "i" );
	session_lang =  preftext.match(string_regexp)[1];
	listUrl = chrome.extension.getURL('locale/'+session_lang+"/foxtrick.properties");
	propertiesxhr.open("GET", listUrl, false);
	propertiesxhr.send();
	var properties = propertiesxhr.responseText;
}
catch(e) {
		var properties = properties_defaultxhr.responseText;
}

// get other non changeable ersources
listUrl = chrome.extension.getURL("content/foxtrick.screenshots");
var screenshotsxhr = new XMLHttpRequest();
screenshotsxhr.open("GET", listUrl, false);
screenshotsxhr.send();

listUrl = chrome.extension.getURL("content/data/htcurrency.xml");
var htcurrencyxhr = new XMLHttpRequest();
htcurrencyxhr.open("GET", listUrl, false);
htcurrencyxhr.send();

listUrl = chrome.extension.getURL("content/data/htNTidList.xml");
var htNTidListxhr = new XMLHttpRequest();
htNTidListxhr.open("GET", listUrl, false);
htNTidListxhr.send();

listUrl = chrome.extension.getURL("content/data/htdateformat.xml");
var htdateformatxhr = new XMLHttpRequest();
htdateformatxhr.open("GET", listUrl, false);
htdateformatxhr.send();

listUrl = chrome.extension.getURL("content/data/foxtrick_about.xml");
var aboutxhr = new XMLHttpRequest();
aboutxhr.open("GET", listUrl, false);
aboutxhr.send();

// worlddetails
listUrl = chrome.extension.getURL("content/data/worlddetails.xml");
var worlddetailsxhr = new XMLHttpRequest();
worlddetailsxhr.open("GET", listUrl, false);
worlddetailsxhr.send();

var League = {};
var countryid_to_leagueid = {};

var data ={};
var name = 'HattrickData';
getchilds(worlddetailsxhr.responseXML.documentElement, data, name);

// reindex: by leagueid and countryid
for (var i in data.HattrickData.LeagueList.League) {
	League[data.HattrickData.LeagueList.League[i].LeagueID] = data.HattrickData.LeagueList.League[i];
	countryid_to_leagueid[data.HattrickData.LeagueList.League[i].Country.CountryID] = data.HattrickData.LeagueList.League[i].LeagueID;
}

var hty_staff = new Array();
var req = new XMLHttpRequest();
var abortTimerId = window.setTimeout(function(){req.abort()}, 20000);
var stopTimer = function(){window.clearTimeout(abortTimerId); };
req.onreadystatechange = function(){
	if (req.readyState == 4){
		stopTimer();
		var frag = document.createElement('dummy');
		frag.innerHTML = req.responseText;
		var htyusers = frag.getElementsByTagName('user');
		for (var i=0;i<htyusers.length;++i) {
			hty_staff.push(htyusers[i].getElementsByTagName('alias')[0].innerHTML);
		}
	}
}
var url = 'http://www.hattrick-youthclub.org/_admin/foxtrick/team.xml';
req.open('GET', url , true);
req.send(null);


// send resource to content scripts
chrome.extension.onConnect.addListener(function(port) {
	if (port.name == "ftpref-query") {
		port.onMessage.addListener(function(msg) {
			try {  //alert(msg.reqtype);
				if (msg.reqtype == "get_settings") {
					port.postMessage({
						set:'settings',
						pref: preftext,
						pref_default: prefdefaultxhr.responseText,
						properties: properties,
						properties_default: properties_defaultxhr.responseText,
						screenshots: screenshotsxhr.responseText,
						htcurrency: htcurrencyxhr.responseText,
						htNTidList: htNTidListxhr.responseText,
						htdateformat: htdateformatxhr.responseText,
						about: aboutxhr.responseText,
						League: League,
						countryid_to_leagueid: countryid_to_leagueid,
						});
				}
				else if (msg.reqtype == "get_hty_staff") {
					port.postMessage({
						set:'hty_staff',
						hty_staff: hty_staff,
					});
				}
				else if (msg.reqtype == "get_css_text") {
					try {
						var css_text_from_response='';
						var cssUrl = msg.css_filelist.split('\n');
						for (var i=0; i<cssUrl.length; ++i) {
							var css_text='';
							if (cssUrl[i].search(/^http|^chrome-extension/)!=-1) { //is a resource file. get cssfile content
								css_xhr = new XMLHttpRequest();
								css_xhr.open("GET", cssUrl[i], false);
								css_xhr.send();
								css_text = css_xhr.responseText;
							}
							else {  css_text = cssUrl[i]; // not a file but line is css text
							}
							if (css_text) {  // remove moz-document statement
								if ( css_text.search('@-moz-document')!=-1) {
									css_text = css_text.replace(/@-moz-document[^\{]+\{/,'');
									var closing_bracket = css_text.lastIndexOf('}');
									css_text = css_text.substr(0,closing_bracket)+css_text.substr(closing_bracket+1);
								}
							}
							css_text_from_response += css_text;
						}
						// replace ff chrome reference by google chrome refs
						var exturl = chrome.extension.getURL('');
						css_text_from_response = css_text_from_response.replace(RegExp("chrome://foxtrick/", "g"), exturl);

						port.postMessage({set:'css_text_set', css_text: css_text_from_response});
					}
					catch (e) {
						alert('css xhr '+e);
						alert(cssUrl[i]);
					}
				}
				else if (msg.reqtype == "export_prefs") {
					var newwin = window.open("about:blank","FoxTrick Preferences","menubar=yes,location=no,resizable=yes,width=400,height=400");
					newwin.document.write('<!DOCTYPE html><html><head><title>Export preferences</title></head><body>// Copy content to a text file and save it<br>'+msg.prefs.replace(/\n/gi,'<br>')+'</body></html>');
					newwin.focus();
				}
				else if (msg.reqtype == "save_prefs") {
					// save new session properties
					preftext = msg.prefs;
					// save in extension settings
					localStorage['pref'] = preftext;

					try {  // set new lang
						var string_regexp = new RegExp( 'user_pref\\("extensions.foxtrick.prefs.htLanguage","(.+)"\\);', "i" );
						try{ var lang =  preftext.match(string_regexp)[1];
						}catch(e) { var lang =  prefdefaultxhr.responseText.match(string_regexp)[1];}
						if (lang != session_lang || msg.reload==true) {
							listUrl = chrome.extension.getURL('locale/'+lang+"/foxtrick.properties");
							propertiesxhr.open("GET", listUrl, false);
							propertiesxhr.send();
							properties = propertiesxhr.responseText;
							localStorage['properties']=properties;
							port.postMessage({set:'lang_changed', properties: propertiesxhr.responseText, reload:msg.reload});
						}
					}
					catch (e) {
						console.log('language doesnt exist: '+lang+' '+e);
					}
				}
				else if (msg.reqtype == "delete_pref") {
					// delete a preference
					try {
						var string_regexp = new RegExp( 'user_pref\\("'+msg.pref+'".+\\n','g');
						console.log(string_regexp+' '+preftext.search(string_regexp));
						preftext = preftext.replace(string_regexp,'');
						localStorage['pref'] = preftext;
					}
					catch (e) {
						console.log('delete_pref '+e);
					}
					//port.postMessage({pref_changed: 'true', prefs:preftext, properties: properties, reload:false});
				}
				else if (msg.reqtype == "delete_pref_list") {
					// delete a preference
					try {
					var string_regexp = new RegExp( 'user_pref\\("'+msg.pref+'".+\\n','g');
					console.log(string_regexp+' '+preftext.search(string_regexp));
					preftext = preftext.replace(string_regexp,'');
					localStorage['pref'] = preftext;
					} catch(e) {console.log('delete_pref '+e);}
					port.postMessage({pref_changed: 'true', prefs:preftext, properties: properties, reload:false});
				}
			}
			catch (e) {
				alert('error msg.reqtype : '+msg.reqtype+' '+e);
			}
		});
	}
	if (port.name == "alert") {
		port.onMessage.addListener(function(msg) {
			try {
				if (msg.reqtype == "show_note") {
					// Create a simple text notification:
					var notification = webkitNotifications.createNotification(
						'ht-favicon.ico',  // icon url - can be relative
						'Hattrick',  // notification title
						msg.message  // notification body text
					);

					// Then show the notification.
					notification.show();

					// close after 5 sec
					setTimeout(function(){
						notification.cancel();
						}, '5000');
				}
				else if (msg.reqtype == "get_old_alerts") {
					if (newstart) port.postMessage({response:'resetalert'});
					else port.postMessage({response:'noresetalert'});
					newstart = false;
				}
				else if (msg.reqtype == "set_mail_count") {
					mail_count = msg.mail_count;
					getInboxCount(function(count) {
							updateUnreadCount(String(parseInt(mail_count)+parseInt(forum_count))+'/'+String(unreadticker_count));
					});
				}
				else if (msg.reqtype == "set_forum_count") {
					forum_count = msg.forum_count;
					getInboxCount(function(count) {
							updateUnreadCount(String(parseInt(mail_count)+parseInt(forum_count))+'/'+String(unreadticker_count));
					});
				}
				 else port.postMessage({});
			}
			catch (e) {
				console.log('error msg.reqtype : '+msg.reqtype+' '+e);
			}
		});
	}
	if (port.name == "chatoldserver") {
		port.onMessage.addListener(function(msg) {
			if (msg.reqtype == "set_last_server") {
				localStorage['lastserver'] = msg.lastserver;
			}
			else if (msg.reqtype == "get_last_server") {
				port.postMessage({response:'lastserver', lastserver:localStorage['lastserver']});
			}
		});
	}
});


chrome.extension.onConnect.addListener(function(port) {
	if (port.name == "htms") {
		port.onMessage.addListener(function(msg) {
			if (msg.reqtype=="get_htms") {
				var req = new XMLHttpRequest();
				var abortTimerId = window.setTimeout(function(){req.abort()}, 20000);
				var stopTimer = function(){window.clearTimeout(abortTimerId); };
				req.onreadystatechange = function(){
					if (req.readyState == 4){
						stopTimer();
						port.postMessage({set:'htms', responseText: req.responseText});
					}
				}
				req.open('GET', msg.url , true);
				req.send(null);
			}
			else
				port.postMessage({});
		});
	}
});


// reload strings after lang change
chrome.extension.onConnect.addListener(function(port) {
	if (port.name == "setpref") {
		port.onMessage.addListener(function(msg) {
			localStorage[msg.pref] = msg.value;
			if (msg.pref=="extensions.foxtrick.prefs.htLanguage") {
				listUrl = chrome.extension.getURL('locale/'+msg.value+"/foxtrick.properties");
				propertiesxhr.open("GET", listUrl, false);
				propertiesxhr.send();
				properties = propertiesxhr.responseText;
				port.postMessage({set:"setlang", properties: propertiesxhr.responseText, from: msg.from});
			}
		});
	}
});

chrome.extension.onRequest.addListener(function(request, sender, sendResponse) {
	var xhr = new XMLHttpRequest();
	xhr.open("GET", request.url, true);
	xhr.onreadystatechange = function(aEvt) {
		if (xhr.readyState == 4) {
			if (xhr.status == 200
				|| xhr.status == 0) {
				sendResponse({data : xhr.responseXML});
			}
		}
	};
	xhr.send();
});
