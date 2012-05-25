"use strict";
/**
 * htev-prediction.js
 * adds some statistics on matches based on HTEV web site info
 * @author CatzHoek
 */

 /*protocol
  * 
  * request: var url = "http://htev.org/api/matchodds/" + matchid +"/"
  *
  * response:
  */
////////////////////////////////////////////////////////////////////////////////
Foxtrick.modules["HTEVPrediction"]={
	MODULE_CATEGORY : Foxtrick.moduleCategories.MATCHES,
	PAGES : ['series'],
	CSS : Foxtrick.InternalPath + "resources/css/htev-prediction.css",
	run : function(doc) {

		var handleHTEVResponse = function(response, status){
			var addPopup = function(matchid, json){
				var links = doc.getElementById("mainBody").getElementsByTagName("a");
				for(var i = 0; i < links.length; i++){
					var mID = Foxtrick.util.id.getMatchIdFromUrl(links[i].href);
					if(matchid == mID && !links[i].parentNode.getElementsByClassName("ft-popup-span").length && !Foxtrick.hasClass(links[i].parentNode,"ft-popup-span")){
						var par = links[i].parentNode;
						var span = Foxtrick.createFeaturedElement(doc, Foxtrick.modules["HTEVPrediction"], "span"); 
						span.className = "ft-popup-span";
						par.insertBefore(span, links[i]);
						span.appendChild(links[i]);

						var htev_div = Foxtrick.createFeaturedElement(doc, Foxtrick.modules["HTEVPrediction"], "div");
						Foxtrick.addClass(htev_div, "ft-htev-popup");

						//navigation
						var div_nav = doc.createElement("div");
						var ul = doc.createElement("ul");
						Foxtrick.addClass(div_nav, "ft-htev-nav");
						
						//see if its a future match
						var isFutureMatch = (json.tie == -1)?true:false;

						//league id
						var leagueId = Foxtrick.util.id.getLeagueLeveUnitIdFromUrl(doc.location.href);
						var li = doc.createElement("li");						
						var htev_link = doc.createElement("a");
						if(isFutureMatch)
							htev_link.href = "http://htev.org/search_leagueid/?SeriesID=" + leagueId;
						else
							htev_link.href = "http://htev.org/match/" + matchid + "/";
						
						htev_link.setAttribute("target","_blank");
						htev_link.setAttribute("title", Foxtrickl10n.getString("HTEVPrediction.goToHTEV"));
						htev_link.textContent = "HTEV";
						li.appendChild(htev_link);
						ul.appendChild(li);
						div_nav.appendChild(ul);
						htev_div.appendChild(div_nav);

						//content
						var table = doc.createElement("table");
						var thead = doc.createElement("thead");
						var tbody = doc.createElement("tbody");
						
						//thead
						var thead_row = doc.createElement("tr");
						var thead_row_h = doc.createElement("th");
						if(!isFutureMatch)
							var thead_row_t = doc.createElement("th");
						var thead_row_a = doc.createElement("th");
						thead_row_h.textContent = Foxtrickl10n.getString("HTEVPrediction.home.short");
						if(!isFutureMatch)
							thead_row_t.textContent = Foxtrickl10n.getString("HTEVPrediction.tie.short");
						thead_row_a.textContent = Foxtrickl10n.getString("HTEVPrediction.away.short");
						thead_row_h.setAttribute("title", Foxtrickl10n.getString("HTEVPrediction.explainHome"));
						if(!isFutureMatch)
							thead_row_t.setAttribute("title", Foxtrickl10n.getString("HTEVPrediction.explainTie"));
						thead_row_a.setAttribute("title", Foxtrickl10n.getString("HTEVPrediction.explainAway"));
						thead_row.appendChild(thead_row_h);
						if(!isFutureMatch)
							thead_row.appendChild(thead_row_t);
						thead_row.appendChild(thead_row_a);
						thead.appendChild(thead_row);
						table.appendChild(thead);

						//tbody
						var tbody_row = doc.createElement("tr");
						var tbody_row_h = doc.createElement("td");
						if(!isFutureMatch)
							var tbody_row_t = doc.createElement("td");
						var tbody_row_a = doc.createElement("td");
						tbody_row_h.textContent = json.hwin + "%";
						if(!isFutureMatch)
							tbody_row_t.textContent = json.tie + "%";
						tbody_row_a.textContent = json.awin + "%";
						tbody_row.appendChild(tbody_row_h);
						if(!isFutureMatch)
							tbody_row.appendChild(tbody_row_t);
						tbody_row.appendChild(tbody_row_a);
						tbody.appendChild(tbody_row);
						table.appendChild(tbody);

						htev_div.appendChild(table);
						span.appendChild(htev_div);
					}
				}	
			}

			//actually react on the load request
			switch(status){
				case 200:
					var json = JSON.parse( response );					
					var cache = Foxtrick.sessionGet("HTEVPrediction.cache");
					if(cache){
						cache[json.matchid] = response;
						Foxtrick.sessionSet("HTEVPrediction.cache", cache);
					} else {
						cache = {};
						cache[json.matchid] = response;
						Foxtrick.sessionSet("HTEVPrediction.cache", cache);
					}
					addPopup(json.matchid, json);
					break;
				default:
					Foxtrick.log("htev error:", response, status);
			}
		}
		
		var links = doc.getElementById("mainBody").getElementsByTagName("a");
		for(var i = 0; i < links.length; i++){
			var matchid = Foxtrick.util.id.getMatchIdFromUrl(links[i].href);
			if(matchid == null)
				continue;

			var cachedReplies = Foxtrick.sessionGet("HTEVPrediction.cache");
			if(cachedReplies && cachedReplies[matchid]){
				Foxtrick.log("HTEV: using cache");
				handleHTEVResponse(cachedReplies[matchid],200);
			} else {
				var url = "http://htev.org/api/matchodds/" + matchid +"/"
				Foxtrick.log("HTEV: request");
				Foxtrick.load(url, handleHTEVResponse);
			}
		}
	}
};
