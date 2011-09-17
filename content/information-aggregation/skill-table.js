/**
	* skill-table.js
	* Show a skill table on players list page
	* @authors: convincedd, ryanli
	*/
////////////////////////////////////////////////////////////////////////////////

var FoxtrickSkillTable = {

	MODULE_NAME : "SkillTable",
	MODULE_CATEGORY : Foxtrick.moduleCategories.INFORMATION_AGGREGATION,
	PAGES : ["players", "oldcoaches","YouthPlayers", "transferSearchResult"],
	OPTIONS : ["OtherTeams", "ColouredYouth"],
	CSS : Foxtrick.InternalPath + "resources/css/skilltable.css",

	// whether skill table is created
	// returns a Boolean
	isTableCreated : function(doc) {
		return Foxtrick.hasElement(doc, "ft_skilltable");
	},

	// returns full type of the document in this format:
	// { type : ["senior"|"youth"|"transfer"], subtype : ["own"|"others"|"nt"|"oldiesCoach"] }
	getFullType : function(doc) {
		var fullType = { type : "", subtype : "" };

		if (Foxtrick.Pages.TransferSearchResults.isTransferSearchResultsPage(doc)) {
			fullType.type = "transfer";
			return fullType;
		}

		var isOwn = Foxtrick.Pages.Players.isOwnPlayersPage(doc);

		if (Foxtrick.Pages.Players.isSeniorPlayersPage(doc) || Foxtrick.Pages.Players.isCoachesPage(doc)) {
			fullType.type = "senior";
			if (Foxtrick.Pages.Players.isNtPlayersPage(doc)) {
				fullType.subtype = "nt";
			}
			else if (Foxtrick.Pages.Players.isOldiesPage(doc)
				|| Foxtrick.Pages.Players.isCoachesPage(doc)) {
				fullType.subtype = "oldiesCoach";
			}
			else if (isOwn) {
				fullType.subtype = "own";
			}
			else {
				fullType.subtype = "others";
			}
		}
		else if (Foxtrick.Pages.Players.isYouthPlayersPage(doc)) {
			fullType.type = "youth";
			if (isOwn) {
				fullType.subtype = "own";
			}
			else {
				fullType.subtype = "others";
			}
		}

		return fullType;
	},

	run : function(doc) {
		if (doc.getElementById("ft_skilltablediv"))
			return;
		if (Foxtrick.isPage("transferSearchResult", doc)
			&& !this.getFullType(doc).subtype === "own"
			&& !FoxtrickPrefs.isModuleOptionEnabled("SkillTable", "OtherTeams")) {
			return;
		}
		FoxtrickSkillTable.addTableDiv(doc);
	},

	change : function(doc) {
		this.run(doc);
	},

	AddHomegrown : function(ev) {
		try {
			var doc = ev.target.ownerDocument;
			doc.getElementById('skilltable_addHomegrownId').setAttribute('style','display:none;');

			var fullType = { type : "oldiesAndOwn"};
			FoxtrickSkillTable.createTable(doc, fullType );

		} catch(e){Foxtrick.log('AddHomegrown',e);}
	},

	removeBotPlayers : function(ev) {
		try {
			var doc = ev.target.ownerDocument;
			doc.getElementById('skilltable_removeBotPlayersId').setAttribute('style','display:none;');

			var markRowIfBotOwner  = function(rows, xml) {
				// check if player not sold or was first sold by this team -> homegrown
				var tid = xml.getElementsByTagName("TeamID")[0].textContent;
				var IsBot = xml.getElementsByTagName("IsBot")[0].textContent;
				var rows = doc.getElementById('ft_skilltable').getElementsByTagName("tr");
				if (IsBot=='True')
					Foxtrick.map(function(tr) {
						if (tr.getAttribute('currentclub')) {
							if (tid==tr.getAttribute('currentclub'))
								tr.setAttribute('isbot',true);
						}
					}, rows);
			};
			var hideRowsWithBotOwner  = function() {
				var rows = doc.getElementById('ft_skilltable').getElementsByTagName("tr");
				Foxtrick.map(function(tr) {
					if (tr.getAttribute('isbot'))
						Foxtrick.addClass(tr, 'hidden');
				}, rows);
			};

			// go though all rows of former players, get their owners team.xml and hide if they are bots
			var rows = doc.getElementById('ft_skilltable').getElementsByTagName("tr");
			rows = Foxtrick.filter(function(tr) {return !tr.getAttribute('currentsquad');}, rows);
			
			var loading = Foxtrick.util.note.createLoading(doc);
			doc.getElementsByClassName("ft_skilltable_wrapper")[0].appendChild(loading);

			var batchArgs = [];
			Foxtrick.map(function(row) {
				var teamid = row.getAttribute('currentclub');
				if (!teamid) 
					return;
				var args = [];
				args.push(["teamid", teamid]);
				args.push(["file", "teamdetails"]);
				batchArgs.push(args);
			}, rows);

			Foxtrick.util.api.batchRetrieve(doc, batchArgs, {cache_lifetime:'session', caller_name:this.MODULE_NAME },
				function(xmls) {
					if (xmls) {
						for (var i=0; i<xmls.length; ++i) {
							if (xmls[i])
								markRowIfBotOwner(rows, xmls[i]);
						}
						hideRowsWithBotOwner();
						if (loading) 
							loading.parentNode.removeChild(loading);
					}
			});
		} catch(e) {console.error('removeBotPlayers',e);}
	},

	showTimeInClub : function(ev) {
		var doc = ev.target.ownerDocument;
		doc.getElementById('skilltable_showTimeInClubId').setAttribute('style','display:none;');
		var loading = Foxtrick.util.note.createLoading(doc);
		doc.getElementsByClassName("ft_skilltable_wrapper")[0].appendChild(loading);

		var setHomeGrownAndJoinedSinceFromTransfers = function(xml, list) {
			var player_id = xml.getElementsByTagName("PlayerID")[0].textContent;
			var TeamId = xml.getElementsByTagName("TeamId")[0].textContent;
			var homegrown = false;
			var Transfers = xml.getElementsByTagName("Transfer");
			if (Transfers.length > 0) {
				var Transfer = Transfers[Transfers.length-1]; // oldest and first transfer
				var seller = Number(Transfer.getElementsByTagName("SellerTeamID")[0].textContent);
				if (seller==TeamId) {
					var homegrown = true;
					Foxtrick.map(function(n) {
						if (n.id==player_id) {
							n.homeGrown = doc.createElement('span');
							n.homeGrown.textContent='*';
							n.homeGrown.title=Foxtrickl10n.getString("skilltable.rebought_youthplayer");
						}
					}, list);
				}
				var Transfer = Transfers[0]; //last transfer to this team
				var Deadline = Transfer.getElementsByTagName("Deadline")[0].textContent;
				Foxtrick.map(function(n) {if (n.id==player_id) n.joinedSince = Deadline;}, list);
				return true;
			}
			else return false;
		};

		var setJoinedSinceFromPullDate = function(xml,list) {
			// check PlayerEventTypeID==20 -> pulled from YA, 13->pulled from SN, 12->coach
			var was_pulled = false;
			var is_external_coach = false;
			var pid = xml.getElementsByTagName("PlayerID")[0].textContent;
			var PlayerEvents = xml.getElementsByTagName("PlayerEvent");
			for (var i=0;i<PlayerEvents.length;++i) {
				var PlayerEvent = PlayerEvents[i];
				var PlayerEventTypeID = Number(PlayerEvent.getElementsByTagName("PlayerEventTypeID")[0].textContent);
				if (PlayerEventTypeID==20 || PlayerEventTypeID==13) {
					was_pulled = true;
					var PullDate = PlayerEvent.getElementsByTagName("EventDate")[0].textContent;
					Foxtrick.map(function(n) {if (n.id==pid) n.joinedSince = PullDate;}, list);
				}
				if (PlayerEventTypeID==12) {
					// is external coach (most likely. internal coaches form starting squad will use the wrong date
					is_external_coach = true;
					var coachDate = PlayerEvent.getElementsByTagName("EventDate")[0].textContent;
					Foxtrick.map(function(n) {if (n.id==pid) n.joinedSince = coachDate;}, list);
				}
			}
			// set homegrown
			if (!is_external_coach)
				Foxtrick.map(function(n) {
					if (n.id==pid) {
						n.homeGrown = doc.createElement('span');
						n.homeGrown.textContent='X';
						n.homeGrown.title=Foxtrickl10n.getString("skilltable.youthplayer");
					}
				}, list);
			return was_pulled || is_external_coach;
		}


		// first get teams activation date. we'll need it later
		var TeamId = Foxtrick.Pages.All.getTeamId(doc);
		var args = [ ["TeamId", TeamId], ["file", "teamdetails"]];
		Foxtrick.util.api.retrieve(doc, args, {cache_lifetime:'session', caller_name:this.MODULE_NAME }, function(xml) {

			var activationDate = xml.getElementsByTagName("ActivationDate")[0].textContent;
			// get the  players
			Foxtrick.Pages.Players.getPlayerList(doc, function(list) {
				// first we check transfers
				var argsTransfersPlayer = [];
				Foxtrick.map(function(player) {
					argsTransfersPlayer.push([ ["playerid", player.id], ["file", "transfersPlayer"] ]);
				}, list);

				Foxtrick.util.api.batchRetrieve(doc, argsTransfersPlayer, {cache_lifetime:'session', caller_name:this.MODULE_NAME }, function(xmls) {
					var argsPlayerevents = [];
					for (var i=0; i<xmls.length; ++i) {
						if (xmls[i]) {
							// if there is a transfer, we are finished with this player
							var hasTransfers = setHomeGrownAndJoinedSinceFromTransfers(xmls[i], list);
							if ( !hasTransfers ) {
								// so, he's from home. need to get pull date from playerevents bellow
								var pid = xmls[i].getElementsByTagName("PlayerID")[0].textContent;
								argsPlayerevents.push([ ["playerid", pid], ["file", "playerevents"] ]);
							}
						}
					}
					// try set joined date from pull date
					Foxtrick.util.api.batchRetrieve(doc, argsPlayerevents, {cache_lifetime:'session', caller_name:this.MODULE_NAME }, function(xmls) {
						for (var i=0; i<xmls.length; ++i) {
							if (xmls[i]) {
								var was_pulled = setJoinedSinceFromPullDate(xmls[i], list);
								if ( !was_pulled ) { 
									// no pull date = from starting squad. JoinedSince=activationDate
									var pid = xmls[i].getElementsByTagName("PlayerID")[0].textContent;
									Foxtrick.map(function(n) {if (n.id==pid) n.joinedSince = activationDate;}, list);
								}
							}
						}
						
						// finished. now display results
						FoxtrickSkillTable.showTable(doc, list);
					});
				});
			});
		});
	},

	showOldiesAndOwn : function(doc) {
		// check for player not sold or was first sold by this team -> homegrown
		var getHomeGrownStatus = function(TeamId, xml) {
			var homeGrown = null;
			// check transfers
			var Transfers = xml.getElementsByTagName("Transfer");
			if (Transfers.length > 0) {
				var Transfer = Transfers[Transfers.length-1]; // oldest and first transfer
				var seller = Number(Transfer.getElementsByTagName("SellerTeamID")[0].textContent);
				if (seller==TeamId) {
					// first transfer form this team, ergo rebought homegrown
					homeGrown = doc.createElement('span');
					homeGrown.textContent = '*';
					homeGrown.title = Foxtrickl10n.getString("skilltable.rebought_youthplayer");
				}
			}
			else {
				// no transfer, ergo homegrown
				homeGrown = doc.createElement('span');
				homeGrown.textContent = 'X';
				homeGrown.title = Foxtrickl10n.getString("skilltable.youthplayer");
			}
			return homeGrown;
		};

		// get normal oldies into oldies_list
		Foxtrick.Pages.Players.getPlayerList(doc, function(oldies_list) {
			// then get current squad (last parameter true) into current_squad_list
			Foxtrick.Pages.Players.getPlayerList(doc, function(current_squad_list) {
				// add homegrown from current squad to oldies
				var TeamId = Foxtrick.Pages.All.getTeamId(doc);
				// check all current players homegrown status based on transfers.xml of each player
				var argsTransfersPlayer = [];
				Foxtrick.map(function(player) {
					argsTransfersPlayer.push([ ["playerid", player.id], ["file", "transfersPlayer"] ]);
				}, current_squad_list);

				Foxtrick.util.api.batchRetrieve(doc, argsTransfersPlayer, {cache_lifetime:'session', caller_name:this.MODULE_NAME }, function(xmls) {
					for (var i=0; i<xmls.length; ++i) {
						if (xmls[i]) {
								var homeGrown = getHomeGrownStatus(TeamId, xmls[i]);
								if (homeGrown) {
									var pid = xmls[i].getElementsByTagName("PlayerID")[0].textContent;
									Foxtrick.map(function(n) {if (n.id== pid) n.homeGrown = homeGrown;}, current_squad_list);
								}
							}
					}
					// filter, concat with oldies and display
					current_squad_list = Foxtrick.filter(function(n) {return n.homeGrown;}, current_squad_list);
					var full_list = oldies_list.concat(current_squad_list);
					FoxtrickSkillTable.showTable(doc, full_list);
				});
			}, true);
		});
	},

	createTable : function(doc, fullType) {
		if (!fullType) fullType = this.getFullType(doc);
		if (fullType.type == "transfer") {
			var playerList = Foxtrick.Pages.TransferSearchResults.getPlayerList(doc);
			FoxtrickSkillTable.showTable(doc, playerList);
		}
		else {
			var loading = Foxtrick.util.note.createLoading(doc);
			doc.getElementsByClassName("ft_skilltable_wrapper")[0].appendChild(loading);
			if (Foxtrick.Pages.Players.isOldiesPage(doc) && fullType.type == "oldiesAndOwn") {
				FoxtrickSkillTable.showOldiesAndOwn(doc);
			}
			else {
				Foxtrick.Pages.Players.getPlayerList(doc, function(list) {
					FoxtrickSkillTable.showTable(doc, list);
				});
			}
		}
	},

	showTable : function(doc, playerList) {
		try {
			// clear old table and loading note
			doc.getElementsByClassName("ft_skilltable_wrapper")[0].innerHTML='';
			var fullType = FoxtrickSkillTable.getFullType(doc);

			// first determine lastMatchday
			var latestMatch = 0, secondLatestMatch = 0;
			if (fullType.type != "transfer"
				&& fullType.subtype != "nt"
				&& !fullType.subtype != "oldiesCoach") {
				var allPlayerInfo = doc.getElementsByClassName("playerInfo");
				for (var i = 0; i < allPlayerInfo.length; ++i) {
					var pid = Foxtrick.Pages.Players.getPlayerId(allPlayerInfo[i]);
					var as = allPlayerInfo[i].getElementsByTagName("a");
					// get last latestMatch and secondLatestMatch
					for (var j = 0; j < as.length; ++j) {
						if (as[j].href.search(/matchid/i) != -1) {
							var matchDay = Foxtrick.util.time.getDateFromText(as[j].textContent).getTime();
							if (matchDay > latestMatch) {
								secondLatestMatch = latestMatch;
								latestMatch = matchDay;
							}
							else if (matchDay > secondLatestMatch && matchDay < latestMatch) {
								secondLatestMatch = matchDay;
							}
						}
					}
				}
			}

			if (fullType.type == "transfer") {
				var allPlayerInfo = doc.getElementsByClassName("transferPlayerInfo");
				for (var i = 0; i < allPlayerInfo.length; ++i) {
					var pid = Foxtrick.Pages.Players.getPlayerId(allPlayerInfo[i]);
					var divs = allPlayerInfo[i].getElementsByTagName('div');
					if (divs.length>2) {
						var psicodiv = divs[divs.length-2]; // second last
						if (psicodiv && psicodiv.innerHTML.search(/\[.+=.+\]=\d+\.\d+/)!=-1) {
							var psicoTSI = psicodiv.innerHTML.match(/\[[^\[]+=[^\[]+\]=(\d+\.\d+)/g)[1].match(/\d+\.\d+/g);
							Foxtrick.map(function(n) {if (n.id==pid) n.psicoTSI = psicoTSI; }, playerList);
						}
					}
				}
			}
			// functions used to attach data to table cell
			var category = function(cell, cat) {
				const categories = ["GK", "WB", "CD", "W", "IM", "FW", "S", "R", "E1", "E2"];
				cell.appendChild(doc.createTextNode(Foxtrickl10n.getString("categories." + categories[cat - 1])));
				cell.setAttribute("index", cat);
			}
			var link = function(cell, link) {
				cell.appendChild(link.cloneNode(true));
			};
			var nationality = function(cell, countryId) {
				var flag = Foxtrick.util.id.createFlagFromCountryId(doc, countryId);
				if (flag) {
					cell.appendChild(flag);
					// League name is a -> img.title
					cell.setAttribute("index", flag.firstChild.title);
				}
			};
			var playerName = function(cell, player) {
				cell.appendChild(player.nameLink.cloneNode(true));
				var extras = "";
				if (player.nationalTeamId) {
					extras = " (NT";
					if (player.trainerData) {
						extras += ", " + Foxtrickl10n.getString("Coach");
					}
					extras += ")";
				}
				else if (player.trainerData) {
					extras = " (" + Foxtrickl10n.getString("Coach") + ")";
				}
				if (extras !== "") {
					cell.appendChild(doc.createTextNode(extras));
				}
			};
			var age = function(cell, age) {
				cell.setAttribute('class','align-left');
				cell.appendChild(doc.createTextNode(age.years + "." + age.days));
				cell.setAttribute("index", age.years * 112 + age.days);
			};
			var status = function(cell, player) {
				var index = 0;
				if (player.yellowCard) {
					if (player.yellowCard === 1) {
						var img = doc.createElement("img");
						img.src = "/Img/Icons/yellow_card.gif";
						img.alt = Foxtrickl10n.getString("Yellow_card.abbr") + "×1";
						img.title = Foxtrickl10n.getString("Yellow_card") + "×1";
						cell.appendChild(img);
					}
					else if (player.yellowCard === 2) {
						var img = doc.createElement("img");
						img.src = "/Img/Icons/dual_yellow_card.gif";
						img.alt = Foxtrickl10n.getString("Yellow_card.abbr") + "×2";
						img.title = Foxtrickl10n.getString("Yellow_card") + "×2";
						cell.appendChild(img);
					}
					index += 10 * player.yellowCard;
				}
				if (player.redCard) {
					var img = doc.createElement("img");
					img.src = "/Img/Icons/red_card.gif";
					img.alt = Foxtrickl10n.getString("Red_card.abbr");
					img.title = Foxtrickl10n.getString("Red_card");
					cell.appendChild(img);
					index += 30;
				}
				if (player.bruised) {
					var img = doc.createElement("img");
					img.src = "/Img/Icons/bruised.gif";
					img.alt = Foxtrickl10n.getString("Bruised.abbr");
					img.title = Foxtrickl10n.getString("Bruised");
					cell.appendChild(img);
					index += 50;
				}
				if (player.injured) {
					var img = doc.createElement("img");
					img.src = "/Img/Icons/injured.gif";
					img.alt = Foxtrickl10n.getString("Injured.abbr");
					img.title = Foxtrickl10n.getString("Injured");
					cell.appendChild(img);
					// player.injured is number from players page,
					// or boolean from transfer result page.
					if (typeof(player.injured) == "number") {
						cell.appendChild(doc.createTextNode(player.injured));
						index += player.injured * 100;
					}
					else {
						index += 100;
					}
				}
				if (player.transferListed) {
					var img = doc.createElement("img");
					img.src = "/Img/Icons/dollar.gif";
					img.alt = Foxtrickl10n.getString("TransferListed.abbr");
					img.title = Foxtrickl10n.getString("TransferListed");
					cell.appendChild(img);
					index += 1;
				}
				Foxtrick.addClass(cell, "status");
				cell.setAttribute("index", index);
			};
			var skill = function(cell, skill) {
				if (typeof(skill) === "object") {
					// in youth team, returned skill is an object

					// First we sort by the max of current and max skill,
					// (multiplied by 10 since maximum is 9 for youth players)
					// then only the current skill, finally whether it's maxed
					cell.setAttribute("index", Math.max(skill.current, skill.max) * 10 + skill.current + !skill.maxed);
					if (skill.maxed) {
						cell.className = "maxed";
					}
					if (skill.current !== 0 || skill.max !== 0) {
						var current = skill.current ? skill.current : "-";
						var max = skill.max ? skill.max : "-";
						cell.appendChild(doc.createTextNode(current + "/" + max));
						// and we deal with colours
						if (FoxtrickPrefs.isModuleOptionEnabled("SkillTable", "ColouredYouth")) {
							if (skill.max > 3) {
								// normalized values for convenience in further calculations
								var skillBase = {}; // skills below 4 are not regarded as interesting
								skillBase.max = skill.max>3 ? skill.max-3 : 0;
								skillBase.current = skill.current>3 ? skill.current-3 : 0;

								// calculate color for capability of improvement
								var r = 0;
								if (skillBase.max > skillBase.current)
									r = ((skillBase.max - skillBase.current) / skillBase.max)*255+51;
								var g = 255;
								var b = 0;

								// apply alpha, indicating max skill
								var a = 1 - skillBase.max / 5; // assuming max skill will never exceed 8...
								a = (a < 0) ? 0 : a; //... but just to be sure
								if (a != 1) {
									r = Math.round(r+(255-r)*a);
									g = Math.round(g+(255-g)*a);
									b = Math.round(b+(255-b)*a);
								}
								cell.style.backgroundColor='rgb('+r+','+g+','+b+')';
							}
							else if (skill.max != 0) {
								// display unimportant skills/low capabilities in gray
								cell.style.backgroundColor = "rgb(204,204,204)";
								cell.style.color = "rgb(102,102,102)";
							}
						}
					}
				}
				else {
					cell.appendChild(doc.createTextNode(skill));
				}
			};
			var noZero = function(cell, value) {
				if (value === true) {
					cell.appendChild(doc.createTextNode("1"));
				}
				else if (value) {
					cell.appendChild(doc.createTextNode(value));
				}
			};
			var speciality = function(cell, spec) {
				var shortSpec = Foxtrickl10n.getShortSpeciality(spec);
				var abbr = doc.createElement("abbr");
				abbr.appendChild(doc.createTextNode(shortSpec));
				abbr.title = spec;
				cell.appendChild(abbr);
				cell.setAttribute("index", spec);
			};
			var lastMatch = function(cell, last) {
				if (last) {
					var matchDay = Foxtrick.util.time.getDateFromText(last.textContent).getTime();
					cell.appendChild(last);
					cell.setAttribute("index", matchDay);
					if (matchDay == latestMatch) {
						Foxtrick.addClass(cell, "latest-match");
					}
					else if (matchDay == secondLatestMatch) {
						Foxtrick.addClass(cell, "second-latest-match");
					}
				}
				else {
					cell.setAttribute("index", 0);
				}
			};
			var position = function(cell, pos) {
				var shortPos = Foxtrickl10n.getShortPosition(pos);
				var abbr = doc.createElement("abbr");
				abbr.appendChild(doc.createTextNode(shortPos));
				abbr.title = pos;
				cell.appendChild(abbr);
				cell.setAttribute("index", pos);
			};
			var league = function(cell, leagueId) {
				var link = doc.createElement("a");
				link.href = "/World/Leagues/League.aspx?LeagueID=" + leagueId;
				link.textContent = Foxtrick.XMLData.League[leagueId].LeagueName;
				cell.appendChild(link);
			};
			var dateText = function(cell, deadline) {
				var dateObj = Foxtrick.util.time.getDateFromText(deadline, "yyyymmdd");
				var season_week = Foxtrick.util.time.gregorianToHT(dateObj);
				var htDate = Foxtrick.util.time.getHtDate(doc)
				var joined_s = Math.floor((htDate.getTime() - dateObj.getTime()) / 1000); //Sec
				var JoinedText = 'NaN';
				try { JoinedText = Foxtrick.util.time.timeDifferenceToText (joined_s , true, true);}
				catch(ee) {	Foxtrick.dump('  JoinedText >' + ee + '\n');}
				cell.innerHTML = JoinedText;
				cell.title = deadline;
				cell.setAttribute('class','align-left');
				cell.setAttribute("index",joined_s);
			};
			var dateLink = function(cell, deadline) {
				deadline.innerHTML = deadline.innerHTML.replace(/div/gi,'span');
				cell.appendChild(deadline);
				cell.setAttribute("index", Foxtrick.util.time.getDateFromText(deadline.textContent).getTime());
			};
			var formatNum = function(cell, num) {
				cell.className = "formatted-num";
				cell.textContent = Foxtrick.formatNumber(num, " ");
				cell.setAttribute("index", num);
			}

// columns used for table information
// name: name of the column, used for fetching l10nized string
// property: value used to retrieve data from Foxtrick.Pages.Players.getPlayerList()
// method: which function to use in order to attach data to cell, should be a
//   function with two arguments, first is table cell(td), second is
//   raw data from playerList. If properties is given (multiple column),
//   then the player is given as date; if property is given instead
//   (single column), the specified property is given. By default the
//   data is treated as plain text and appended to the cell.
// sortAsc: whether to sort the column in ascending order, default is in
//   descending order.
// sortString: whether to sort the column with values as string, default is as
//   numbers. If set to true, sortAsc is always on.
// alignRight: whether to align the data cells to the right
// img: images used in table headers as substitution of text

			var columns = [
				{ name : "PlayerNumber", property : "number", sortAsc : true },
				{ name : "PlayerCategory", property : "category", method: category, sortAsc: true },
				{ name : "Nationality", property : "countryId", method : nationality, sortString : true },
				{ name : "Player", properties : ["nameLink", "nationalTeamId", "trainerData"], method : playerName, sortString : true },
				{ name : "Bookmark", property : "bookmarkLink", method : link, sortString : true },
				{ name : "CurrentBid", property : "currentBid", method : formatNum, alignRight : true },
				{ name : "CurrentBidder", property : "currentBidderLink", method : link, sortString : true },
				{ name : "CurrentBidderShort", property : "currentBidderLinkShort", method : link, sortString : true },
				{ name : "Hotlist", property : "hotlistLink", method : link, sortString : true },
				{ name : "Age", property : "age", method : age, sortAsc : true },
				{ name : "TSI", property : "tsi", alignRight : true, method : formatNum },
				{ name : "Status", properties : ["yellowCard", "redCard", "bruised", "injured", "transferListed"], method : status },
				{ name : "Speciality", property : "speciality", method : speciality, sortString : true },
				{ name : "Leadership", property : "leadership" },
				{ name : "Experience", property : "experience" },
				{ name : "Form", property : "form" },
				{ name : "Stamina", property : "stamina" },
				{ name : "Keeper", property : "keeper", method: skill },
				{ name : "Defending", property : "defending", method: skill },
				{ name : "Playmaking", property : "playmaking", method: skill },
				{ name : "Winger", property : "winger", method: skill },
				{ name : "Passing", property : "passing", method: skill },
				{ name : "Scoring", property : "scoring", method: skill },
				{ name : "Set_pieces", property : "setPieces", method: skill },
				{ name : "PsicoTSI", property : "psicoTSI", alignRight : true, method: formatNum },
				{ name : "HTMS_Ability", property : "htmsAbility" },
				{ name : "HTMS_Potential", property : "htmsPotential" },
				{ name : "Agreeability", property : "agreeability" },
				{ name : "Aggressiveness", property : "aggressiveness" },
				{ name : "Honesty", property : "honesty" },
				{ name : "Last_match", property : "lastMatch", method : lastMatch },
				{ name : "Last_stars", property : "lastRating", img : "/Img/Matches/star_blue.png" },
				{ name : "Last_position", property : "lastPosition", method : position, sortString : true },
				{ name : "Salary", property : "salary", alignRight : true, method : formatNum },
				{ name : "NrOfMatches", property : "matchCount" },
				{ name : "LeagueGoals", property : "leagueGoals" },
				{ name : "CupGoals", property : "cupGoals" },
				{ name : "FriendliesGoals", property : "friendliesGoals" },
				{ name : "CareerGoals", property : "careerGoals" },
				{ name : "Hattricks", property : "hattricks" },
				{ name : "JoinedSince", property : "joinedSince", method : dateText},
				{ name : "HomeGrown", property : "homeGrown", method : link},
				{ name : "Deadline", property : "deadline", method : dateLink },
				{ name : "Current_club", property : "currentClubLink", method : link, sortString : true },
				{ name : "Current_league", property : "currentLeagueId", method: league, sortString : true },
				{ name : "TransferCompare", property : "transferCompare", method : link},

			];

			for (var j = 0; j < columns.length; ++j) {
				columns[j].available = false;
				if (columns[j].properties) {
					for (var pIndex in columns[j].properties) {
						if (Foxtrick.Pages.Players.isPropertyInList(playerList, columns[j].properties[pIndex])) {
							columns[j].available = true;
							columns[j].enabled = FoxtrickSkillTable.getColumnEnabled(fullType, columns[j].name);
							break;
						}
					}
				}
				else if (columns[j].property) {
					if (Foxtrick.Pages.Players.isPropertyInList(playerList, columns[j].property)) {
						columns[j].available = true;
						columns[j].enabled = FoxtrickSkillTable.getColumnEnabled(fullType, columns[j].name);
					}
				}
			}

			var oldcustomizeTable = doc.getElementsByClassName("ft_skilltable_customizetable")[0];
			if (oldcustomizeTable) oldcustomizeTable.parentNode.removeChild(oldcustomizeTable);
			var customizeTable = FoxtrickSkillTable.createCustomizeTable(columns, doc);
			Foxtrick.addClass(customizeTable, "hidden");

			var table = doc.createElement("table");
			table.id = "ft_skilltable";
			table.className = "ft_skilltable";

			thead = doc.createElement("thead");
			var tr = doc.createElement("tr");
			thead.appendChild(tr);
			table.appendChild(thead);
			for (var j = 0; j < columns.length; j++) {
				if (columns[j].enabled) {
					var th = doc.createElement("th");
					if (columns[j].sortString) {
						th.setAttribute("sort-string", true);
					}
					if (columns[j].sortAsc) {
						th.setAttribute("sort-asc", true);
					}
					Foxtrick.listen(th, "click", FoxtrickSkillTable.sortClick, false);

					var fullName = Foxtrickl10n.getString(columns[j].name);
					var abbrName = Foxtrickl10n.getString(columns[j].name + ".abbr");
					var abbr = true;
					if (!abbrName || fullName === abbrName) {
						abbr = false;
					}
					if (abbr) {
						if (columns[j].img) {
							var img = doc.createElement("img");
							img.setAttribute("src", columns[j].img);
							img.setAttribute("alt", abbrName);
							img.setAttribute("title", fullName);
							th.appendChild(img);
						}
						else {
							var abbr = doc.createElement("abbr");
							abbr.setAttribute("title", fullName);
							abbr.appendChild(doc.createTextNode(abbrName));
							th.appendChild(abbr);
						}
					}
					else {
						if (columns[j].img) {
							var img = doc.createElement("img");
							img.setAttribute("src", columns[j].img);
							img.setAttribute("alt", fullName);
							img.setAttribute("title", fullName);
						}
						else {
							th.appendChild(doc.createTextNode(fullName));
						}
					}
					tr.appendChild(th);
				}
			}

			var tbody = doc.createElement("tbody");
			table.appendChild(tbody);

			for (var i in playerList) {
				var row = doc.createElement("tr");
				row.setAttribute('playerid', playerList[i].id);
				if (playerList[i].currentSquad) row.setAttribute('currentsquad', playerList[i].currentSquad);
				if (playerList[i].currentClubLink) row.setAttribute('currentclub', playerList[i].currentClubLink.href.match(/\/Club\/\?TeamID=(\d+)/i)[1]);
				tbody.appendChild(row);
				for (var j in columns) {
					if (columns[j].enabled) {
						var cell = doc.createElement("td");
						row.appendChild(cell);
						if (columns[j].properties) {
							if (columns[j].method) {
								columns[j].method(cell, playerList[i]);
							}
							else {
								for (var pIndex = 0; pIndex < columns[j].properties.length; ++pIndex) {
									cell.appendChild(doc.createTextNode(playerList[i][columns[j].properties[pIndex]]));
									if (pIndex !== columns[j].properties.length) {
										cell.appendChild(doc.createTextNode(", "));
									}
								}
							}
						}
						else if (columns[j].property && playerList[i][columns[j].property] !== undefined) {
							if (columns[j].method) {
								columns[j].method(cell, playerList[i][columns[j].property]);
							}
							else {
								cell.textContent = playerList[i][columns[j].property];
							}
						}
						if (columns[j].alignRight) {
							Foxtrick.addClass(cell, "align-right");
						}
					}
				}
			}

			var tablediv = doc.getElementById("ft_skilltablediv");
			var insertCustomizeTable = function(customizeTable) {
				var wrapper = tablediv.getElementsByClassName("ft_skilltable_customizewrapper")[0];
				wrapper.appendChild(customizeTable);
			};

			var insertSkillTable = function(skillTable) {
				var wrapper = tablediv.getElementsByClassName("ft_skilltable_wrapper")[0];
				wrapper.appendChild(skillTable);
			};

			insertCustomizeTable(customizeTable);
			insertSkillTable(table);

			var container = tablediv.getElementsByClassName("ft_skilltable_container")[0];
			if (FoxtrickPrefs.getBool("module.SkillTable.top")) {
				Foxtrick.addClass(container, "on_top");
			}

			var removeBotPlayersLink=doc.getElementById('skilltable_removeBotPlayersId')
			if (removeBotPlayersLink) removeBotPlayersLink.setAttribute('style','display:inline;');

		}
		catch (e) {
			Foxtrick.log(e);
		}
	},

	sortClick : function(ev) {
		try {
			var head = ev.currentTarget;
			var doc = ev.target.ownerDocument;
			var table = doc.getElementById('ft_skilltable');

			// determine sort direction
			var sortIndex = Foxtrick.getChildIndex(head);
			var sortAsc = head.hasAttribute("sort-asc");
			if (sortIndex == table.getAttribute('lastSortIndex')) {
				if (sortAsc) head.removeAttribute("sort-asc");
				else head.setAttribute("sort-asc","true");
				sortAsc = !Boolean(sortAsc);
			}
			table.setAttribute('lastSortIndex', sortIndex) ;


			var sortString = head.hasAttribute("sort-string");

			var table = doc.getElementById("ft_skilltable");

			var rows = [];

			var sortByIndex = Foxtrick.any(function(n) {
				return n.cells[sortIndex].hasAttribute("index");
			}, table.rows);

			for (var i = 1; i < table.rows.length; ++i)
				rows.push(table.rows[i].cloneNode(true));

			/* sortCompare
				sortClick() will first check whether every cell in that column has the
				attribute `index'. If so, they will be ordered with that attribute as
				key. Otherwise, we use their textContent.
			*/
			var sortCompare = function(a, b) {
				var aContent, bContent;
				var lastSort = Number(a.getAttribute('lastSort'))-Number(b.getAttribute('lastSort'));
				if (sortByIndex) {
					aContent = a.cells[sortIndex].getAttribute("index");
					bContent = b.cells[sortIndex].getAttribute("index");
				}
				else {
					aContent = a.cells[sortIndex].textContent;
					bContent = b.cells[sortIndex].textContent;
				}
				if (aContent === bContent) {
					return lastSort;
				}
				// place empty cells at the bottom
				if (aContent === "" || aContent === null || aContent === undefined) {
					return 1;
				}
				if (bContent === "" || bContent === null || bContent === undefined) {
					return -1;
				}
				if (sortString) {
					// always sort by ascending order
					return aContent.localeCompare(bContent);
				}
				else {
					aContent = parseFloat(aContent);
					bContent = parseFloat(bContent);
					aContent = isNaN(aContent) ? lastSort : aContent;
					bContent = isNaN(bContent) ? lastSort : bContent;
					if (aContent === bContent) {
						return lastSort;
					}
					if (sortAsc) {
						return aContent - bContent;
					}
					else {
						return bContent - aContent;
					}
				}
			};

			rows.sort(sortCompare);

			var newBody = doc.createElement("tbody");
			for (var i = 0; i < rows.length; ++i) {
				rows[i].setAttribute('lastSort',i);
				newBody.appendChild(rows[i]);
			}
			table.getElementsByTagName("tbody")[0].innerHTML = newBody.innerHTML;
		}
		catch (e) {
			Foxtrick.log(e);
		}
		finally {
			if (ev)
				ev.stopPropagation();
		}
		Foxtrick.log.flush(doc);
	},

	view : function(ev) {
		var doc = ev.target.ownerDocument;
		var tablediv = doc.getElementById("ft_skilltablediv");
		var container = tablediv.getElementsByClassName("ft_skilltable_container")[0];
		Foxtrick.toggleClass(container, "on_top");

		FoxtrickPrefs.setBool("module.SkillTable.top", Foxtrick.hasClass(container, "on_top"));
	},

	customize : function(ev) {
		var doc = ev.target.ownerDocument;
		var links = doc.getElementsByClassName("ft_skilltable_links")[0];
		Foxtrick.addClass(links, "customizing");

		var customizeTable = doc.getElementsByClassName("ft_skilltable_customizetable")[0];
		Foxtrick.removeClass(customizeTable, "hidden");

		var container = doc.getElementsByClassName("ft_skilltable_container")[0];
		Foxtrick.addClass(container, "hidden");
	},

	save : function(ev) {
		try {
			var doc = ev.target.ownerDocument;
			var fullType = FoxtrickSkillTable.getFullType(doc);

			var tablediv = doc.getElementById("ft_skilltablediv");
			var input = tablediv.getElementsByTagName("input");
			for (var i=0; i<input.length; ++i) {
				FoxtrickSkillTable.setColumnEnabled(fullType, input[i].id, input[i].checked);
			}
			doc.location.reload();
		}
		catch (e) {
			Foxtrick.log(e);
		}
	},

	cancel : function(ev) {
		try {
			var doc = ev.target.ownerDocument;
			var tablediv = doc.getElementById("ft_skilltablediv");
			var links = tablediv.getElementsByClassName("ft_skilltable_links")[0];
			var customizeTable = tablediv.getElementsByClassName("ft_skilltable_customizetable")[0];
			var container = tablediv.getElementsByClassName("ft_skilltable_container")[0];
			Foxtrick.removeClass(links, "customizing");
			Foxtrick.addClass(customizeTable, "hidden");
			Foxtrick.removeClass(container, "hidden");
		}
		catch(e) {
			Foxtrick.log(e);
		}
	},

	addTableDiv : function(doc) {
		var tablediv = doc.createElement("div");
		tablediv.id = "ft_skilltablediv";
		tablediv.className = "ft_skilltablediv";
		if (Foxtrick.Pages.TransferSearchResults.isTransferSearchResultsPage(doc)) {
			Foxtrick.addClass(tablediv, "transfer");
		}

		var tableCreated = false;

		// table div head
		var h2 = doc.createElement("h2");
		h2.className = "ft-expander-unexpanded";
		h2.appendChild(doc.createTextNode(Foxtrickl10n.getString("Skill_table")));
		var toggleDisplay = function() {
			try {
				if (!tableCreated) {
					tableCreated = true;
					FoxtrickSkillTable.createTable(doc);
				}

				Foxtrick.toggleClass(h2, "ft-expander-expanded");
				Foxtrick.toggleClass(h2, "ft-expander-unexpanded");
				var show = Foxtrick.hasClass(h2, "ft-expander-expanded");

				var customizeTable = tablediv.getElementsByClassName("ft_skilltable_customizetable")[0];
				if (show) {
					// show the objects
					Foxtrick.removeClass(links, "hidden");
					Foxtrick.removeClass(container, "hidden");
				}
				else {
					// hide the objects
					Foxtrick.removeClass(links, "customizing");
					Foxtrick.addClass(links, "hidden");
					Foxtrick.addClass(customizeTable, "hidden");
					Foxtrick.addClass(container, "hidden");
				}
			}
			catch (e) {
				Foxtrick.log(e);
			}
		};
		Foxtrick.listen(h2, "click", toggleDisplay, false);
		tablediv.appendChild(h2);

		// links
		var links = doc.createElement("div");
		links.className = "ft_skilltable_links";
		Foxtrick.addClass(links, "hidden");
		// links: copy
		var copy = doc.createElement("a");
		copy.className = "customize_item secondary";
		copy.appendChild(doc.createTextNode(Foxtrickl10n.getString("Copy")));
		copy.setAttribute("title", Foxtrickl10n.getString("foxtrick.tweaks.copyskilltable"));
		Foxtrick.listen(copy, "click", FoxtrickSkillTable.copyTable, false);
		// links: customize
		var customize = doc.createElement("a");
		customize.className = "customize_item";
		customize.appendChild(doc.createTextNode(Foxtrickl10n.getString("button.customize")));
		Foxtrick.listen(customize, "click", FoxtrickSkillTable.customize, false);
		// links: save
		var save = doc.createElement("a");
		save.appendChild(doc.createTextNode(Foxtrickl10n.getString("button.save")));
		Foxtrick.listen(save, "click", FoxtrickSkillTable.save, false);
		// links: cancel
		var cancel = doc.createElement("a");
		cancel.appendChild(doc.createTextNode(Foxtrickl10n.getString("button.cancel")));
		Foxtrick.listen(cancel, "click", FoxtrickSkillTable.cancel, false);
		// links: all children
		links.appendChild(copy);
		links.appendChild(customize);
		links.appendChild(save);
		links.appendChild(cancel);

		// customize table wrapper
		var customizeWrapper = doc.createElement("div");
		customizeWrapper.className = "ft_skilltable_customizewrapper";

		// table container
		var container = doc.createElement("div");
		container.className = "ft_skilltable_container";
		Foxtrick.addClass(container, "hidden");
		// table container: switch view
		var switchView = doc.createElement("div");
		var switchViewLink = doc.createElement("a");
		switchViewLink.appendChild(doc.createTextNode(Foxtrickl10n.getString("Switch_view")));
		switchViewLink.setAttribute("title", Foxtrickl10n.getString("foxtrick.SkillTable.Switch_view_title"));
		Foxtrick.listen(switchViewLink, "click", FoxtrickSkillTable.view, false);
		switchView.appendChild(switchViewLink);

		if (Foxtrick.util.api.authorized() ) {
			if (Foxtrick.Pages.Players.isOldiesPage(doc)) {
				var options = doc.createElement("div");
				var addHomegrownLink = doc.createElement("a");
				addHomegrownLink.appendChild(doc.createTextNode(Foxtrickl10n.getString("AddHomegrown")));
				addHomegrownLink.setAttribute("title", Foxtrickl10n.getString("foxtrick.SkillTable.Add_homegrown_title"));
				addHomegrownLink.setAttribute("id","skilltable_addHomegrownId");
				Foxtrick.listen(addHomegrownLink, "click", FoxtrickSkillTable.AddHomegrown, false);
				options.appendChild(addHomegrownLink);

				options.appendChild(doc.createElement('br'));
				var removeBotPlayersLink = doc.createElement("a");
				removeBotPlayersLink.appendChild(doc.createTextNode(Foxtrickl10n.getString("RemoveBotPlayers")));
				removeBotPlayersLink.setAttribute("title", Foxtrickl10n.getString("foxtrick.SkillTable.Remove_bot_players_title"));
				removeBotPlayersLink.setAttribute("id","skilltable_removeBotPlayersId");
				Foxtrick.listen(removeBotPlayersLink, "click", FoxtrickSkillTable.removeBotPlayers, false);
				options.appendChild(removeBotPlayersLink);
			}
			else if (Foxtrick.Pages.Players.isSeniorPlayersPage(doc)) {
				var options = doc.createElement("div");
				var addHomegrownLink = doc.createElement("a");
				addHomegrownLink.appendChild(doc.createTextNode(Foxtrickl10n.getString("showTimeInClub")));
				addHomegrownLink.setAttribute("title", Foxtrickl10n.getString("foxtrick.SkillTable.showTimeInClub_title"));
				addHomegrownLink.setAttribute("id","skilltable_showTimeInClubId");
				Foxtrick.listen(addHomegrownLink, "click", FoxtrickSkillTable.showTimeInClub, false);
				options.appendChild(addHomegrownLink);
			}
		}
		// table container: table wrapper
		var wrapper = doc.createElement("div");
		wrapper.className = "ft_skilltable_wrapper";
		// table container: all children
		container.appendChild(switchView);
		container.appendChild(wrapper);
		if (options) container.appendChild(options);

		tablediv.appendChild(h2);
		tablediv.appendChild(links);
		tablediv.appendChild(customizeWrapper);
		tablediv.appendChild(container);

		// insert tablediv
		if (Foxtrick.Pages.TransferSearchResults.isTransferSearchResultsPage(doc)) {
			// on transfer search page, insert after first separator
			var insertBefore = doc.getElementById("mainBody").getElementsByClassName("borderSeparator")[0].nextSibling;
			insertBefore.parentNode.insertBefore(tablediv, insertBefore);
		}
		else {
			var playerList = doc.getElementsByClassName("playerList")[0];
			if (playerList) {
				// If there is playerList, as there is in youth/senior teams,
				// insert before it. In such cases, there would be category headers
				// for supporters, inserting before the first player would clutter
				// up with the headers. Additionally, inserting before the list
				// would be organized in a better way.
				playerList.parentNode.insertBefore(tablediv, playerList);
			}
			else {
				// otherwise, insert before the first player if there is any
				var firstFace = doc.getElementsByClassName("faceCard")[0];
				if (firstFace) {
					// without playerList, players would have faces shown before
					// playerInfo, if user enabled faces
					firstFace.parentNode.insertBefore(tablediv, firstFace);
				}
				else {
					var firstPlayer = doc.getElementsByClassName("playerInfo")[0];
					if (firstPlayer) {
						// or... users haven't enabled faces
						firstPlayer.parentNode.insertBefore(tablediv, firstPlayer);
					}
				}
			}
		}
		return tablediv;
	},

	createCustomizeTable : function(properties, doc) {
		var table = doc.createElement("table");
		table.className = "ft_skilltable_customizetable";
		var thead = doc.createElement("thead");
		var tbody = doc.createElement("tbody");
		var headRow = doc.createElement("tr");
		var checkRow = doc.createElement("tr");
		table.appendChild(thead);
		table.appendChild(tbody);
		thead.appendChild(headRow);
		tbody.appendChild(checkRow);
		for (var i = 0; i < properties.length; ++i) {
			if (properties[i].available) {
				var th = doc.createElement("th");

				var fullName = Foxtrickl10n.getString(properties[i].name);
				var abbrName = Foxtrickl10n.getString(properties[i].name + ".abbr");
				var abbr = true;
				if (!abbrName || fullName === abbrName) {
					abbr = false;
				}
				if (abbr) {
					if (properties[i].img) {
						var img = doc.createElement("img");
						img.setAttribute("src", properties[i].img);
						img.setAttribute("alt", abbrName);
						img.setAttribute("title", fullName);
						th.appendChild(img);
					}
					else {
						var abbr = doc.createElement("abbr");
						abbr.setAttribute("title", fullName);
						abbr.appendChild(doc.createTextNode(abbrName));
						th.appendChild(abbr);
					}
				}
				else {
					if (properties[i].img) {
						var img = doc.createElement("img");
						img.setAttribute("src", properties[i].img);
						img.setAttribute("alt", fullName);
						img.setAttribute("title", fullName);
					}
					else {
						th.appendChild(doc.createTextNode(fullName));
					}
				}
				var td = doc.createElement("td");
				var check = doc.createElement("input");
				check.id = properties[i].name;
				check.setAttribute("type", "checkbox");
				if (properties[i].enabled) {
					check.setAttribute("checked", "checked");
				}
				td.appendChild(check);
				headRow.appendChild(th);
				checkRow.appendChild(td);
			}
		}
		return table;
	},

	fullTypeToString : function(fullType) {
		if (fullType.subtype) {
			return fullType.type + "." + fullType.subtype;
		}
		return fullType.type;
	},

	getColumnEnabled : function(fullType, name) {
		return FoxtrickPrefs.getBool("module.SkillTable." + this.fullTypeToString(fullType) + "." + name);
	},

	setColumnEnabled : function(fullType, name, enabled) {
		FoxtrickPrefs.setBool("module.SkillTable." + this.fullTypeToString(fullType) + "." + name, enabled);
	},

	copyTable : function(ev) {
		try {
			var doc = ev.target.ownerDocument;
			var table = doc.getElementsByClassName("ft_skilltable")[0];
			Foxtrick.copyStringToClipboard(FoxtrickSkillTable.toHtMl(table));

			var note = Foxtrick.util.note.add(doc, table, "ft-skilltable-copy-note", Foxtrickl10n.getString("foxtrick.tweaks.skilltablecopied"), null, true);
		}
		catch (e) {
			Foxtrick.log(e);
		}
	},

	toHtMl : function(table) {
		try {
			var ret = "[table]\n";
			for (var rowIndex = 0; rowIndex < table.rows.length; ++rowIndex) {
				var row = table.rows[rowIndex];
				ret += "[tr]";
				for (var cellIndex = 0; cellIndex < row.cells.length; ++cellIndex) {
					var cell = row.cells[cellIndex];
					var cellName = cell.tagName.toLowerCase();
					var cellContent = this._getNode(cell);
					if (Foxtrick.hasClass(cell, "maxed")) {
						cellContent = "[b]" + this._getNode(cell) + "[/b]";
					}
					else if (Foxtrick.hasClass(cell, "formatted-num")){
						cellContent = Foxtrick.trimnum(this._getNode(cell));
					}
					ret += "[" + cellName + "]" + cellContent + "[/" + cellName +"]";
				}
				ret += "[/tr]\n";
			}
			ret += "[/table]";
			return ret;
		}
		catch (e) {
			Foxtrick.log(e);
		}
	},

	/* get the text content in a node and return it.
	 * for player links, append the [playerid] HT-ML tag
	 * for images, return its alt attribute
	 */
	_getNode : function(node) {
		var youthPlayerRe = new RegExp("YouthPlayerID=(\\d+)", "i");
		var playerRe = new RegExp("PlayerID=(\\d+)", "i");
		if (node.nodeName.toLowerCase() == "a" && node.href.search(youthPlayerRe) != -1) {
			var ret = node.textContent;
			ret += " [youthplayerid=";
			ret += node.href.match(youthPlayerRe)[1];
			ret += "]";
			return ret;
		}
		else if (node.nodeName.toLowerCase() == "a" && node.href.search(playerRe) != -1) {
			var ret = node.textContent;
			ret += " [playerid=";
			ret += node.href.match(playerRe)[1];
			ret += "]";
			return ret;
		}
		else if (node.hasChildNodes()) {
			var children = node.childNodes;
			var ret = "";
			for (var i = 0; i < children.length; ++i) {
				// recursively get the content of child nodes
				ret += this._getNode(children[i]) + " ";
			}
			return Foxtrick.trim(ret);
		}
		else {
			if (node.nodeName.toLowerCase() == "img") {
				return node.getAttribute("alt");
			}
			else {
				return node.textContent;
			}
		}
	}
};
Foxtrick.util.module.register(FoxtrickSkillTable);
