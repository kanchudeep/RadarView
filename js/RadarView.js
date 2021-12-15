/*exported RadarView*/
// UglifyJS: \uglifyjs -m reserved=['RadarView'] --toplevel Workspace/javascript/RadarView.js
"use strict";

if (!Math.toRadians)
	Math.toRadians = function(angleDegree) {
		return angleDegree * Math.PI / 180;
	};
if (!Math.toDegrees)
	Math.toDegrees = function(angleRadians) {
		return angleRadians * 180 / Math.PI;
	};
if (!Number.isNaN)
	Number.isNaN = function(number) {
		return typeof number === "number" && number !== number;
	};
if (!String.prototype.trim) //jshint freeze: false
	String.prototype.trim = function() {
		return this.replace(/^\s+|\s+$/gm, "");
	};

/** RadarView object
	Usage:
		// Create instance with canvas & site
		var rv = new RadarView(getDocumentById("canvasRadar"), {lon: 76.54, lat: 23.45});
		// Add airports
		rv.setAirports([{icao: "VIDP", lon: 77.1003, lat: 28.5562}]);
		// Add aircrafts
		rv.setAircrafts([{flight: "ABC123", icao: "812345", squawk: "1234", lon: 78.9012, lat: 21.0987, track: 123}]);
		// Draw
		rv.draw();
		// Update
		rv.setAircrafts([{...}]);
		rv.draw()
*/
function RadarView(canvas, site) {
	if (typeof canvas === "undefined")
		throw "Error: Invalid canvas";
	if (typeof canvas.getContext !== "function")
		throw "Error: Canvas not supported";
	if (typeof site === "undefined" || typeof site.lon === "undefined" || typeof site.lat === "undefined")
		throw "Error: Invalid site";

	var _canvas = canvas,
			_site = {lon: site.lon, lat: site.lat}, // Radar site/centre
			_range,// Radar range (NM)
			_aircrafts = [], // Array of aircraft objects
			_timeAircrafts, // Time of aircrafts update
			_airports = [], // Array of airport objects
			_shapes = [], // Array of shapes to draw [[[],[]],[[],[]]]
			_onClick, // Function for onclick
			_pointInfo = [], // Array of point info {x, y, action, text}
			_cacheEvent = [], // Cache of events for pointer events
			_lastDeltaPointerEvent = -1, // Cache of last difference in pointer events
			that = this; // Reference to RadarView object

	// Maximise height/width
	_canvas.height = Math.max(_canvas.height, _canvas.width);
	_canvas.width = Math.max(_canvas.height, _canvas.width);

	_canvas.style.background = this.COLOUR_BACKGROUND;

	/** Method to draw RadarView*/
	this.draw = function() {
		if (_canvas.getContext) {
			var width = _canvas.width,
					height = _canvas.height,
					mid = {x: width / 2, y: height / 2},
					scale = (Math.min(width, height) / 2) / _range, // Scale to convert NM to px
					ctx = _canvas.getContext("2d"); // Prepare display

			_pointInfo = []; // Clear point info

			// Clear
			ctx.fillStyle = this.COLOUR_BACKGROUND;
			ctx.fillRect(0, 0, width, height);

			ctx.lineCap = "butt";
			ctx.lineWidth = this.WIDTH_LINES;
			ctx.miterLimit = this.SIZE_STROKE;

			// Draw shapes
			if (_shapes && _shapes.length > 0) {
				ctx.strokeStyle = this.COLOUR_SHAPE;
				for (var i = 0, j, draw, pt; i < _shapes.length; ++i) {
					ctx.beginPath();
					draw = false;
					for (j = 0; j < _shapes[i].length - 1; ++j)
						if (Math.min(_shapes[i][j].distance, _shapes[i][j + 1].distance) <= _range) {
							draw = true;
							pt = [this.getPointAtBearingDistance(mid, _shapes[i][j].bearing, _shapes[i][j].distance * scale),
									this.getPointAtBearingDistance(mid, _shapes[i][j + 1].bearing, _shapes[i][j + 1].distance * scale)];
							ctx.moveTo(pt[0].x, pt[0].y);
							ctx.lineTo(pt[1].x, pt[1].y);
						}
					if (draw)
						ctx.stroke();
				}
			}

			// Blank area outside last circle
			ctx.beginPath();
			ctx.arc(mid.x, mid.y, _range * scale, 0, 2 * Math.PI);
			ctx.rect(width, 0, -width, height);
			ctx.fill();

			// Draw graticule lines
			ctx.setLineDash([4, 4]);
			ctx.strokeStyle = this.COLOUR_GRATICULE;
			for (var i = 0, start, end; i < 180; i += 45) {
				start = this.getPointAtBearingDistance(mid, i, Math.min(width, height) / 2);
				end = this.getPointAtBearingDistance(mid, i + 180, Math.min(width, height) / 2);
				ctx.beginPath();
				ctx.moveTo(start.x, start.y);
				ctx.lineTo(end.x, end.y);
				ctx.stroke();
			}

			// Draw graticule circles
			ctx.strokeStyle = this.COLOUR_GRATICULE;
			for (var i = this.STEP_RANGE, radius; i <= _range; i += this.STEP_RANGE) {
				radius = i * scale;
				ctx.setLineDash(i % 100 === 0 ? [0, 0] : [4, 4]);
				ctx.beginPath();
				ctx.arc(mid.x, mid.y, radius, 0, 2 * Math.PI);
				ctx.stroke();
			}

			// Draw airports
			ctx.font = this.SIZE_TEXT + "px monospace";
			ctx.strokeStyle = this.COLOUR_BACKGROUND;
			ctx.setLineDash([0, 0]);
			for (var i = 0, dY, pt; i < _airports.length; ++i) {
				if (_airports[i].distance < _range) {
					pt = this.getPointAtBearingDistance(mid, _airports[i].bearing, _airports[i].distance * scale);
					_pointInfo.push({x: pt.x, y: pt.y, action: "https://flightaware.com/live/airport/" + _airports[i].icao,
							text: (_airports[i].name ? _airports[i].name + " - " : "")
							+ _airports[i].icao + "\nBearing: " + (Math.round(_airports[i].bearing) % 360) + "\u00b0, Distance:" + _airports[i].distance.toFixed(_airports[i].distance < 10 ? 2 : 1).replace(/\.0+$/gm, "") + "NM"});
					for (var j = 0; j < 2; ++j) {
						ctx.beginPath();
						ctx.fillStyle = j ? this.COLOUR_AIRPORT : this.COLOUR_BACKGROUND;
						ctx.arc(pt.x, pt.y, this.SIZE_AIRPORT + (j ? 0 : this.SIZE_STROKE), 0, 2 * Math.PI);
						ctx.fill();
					}
					dY = pt.y < mid.y ? this.SIZE_TEXT + 2 : -4 ;
					ctx.lineWidth = this.SIZE_STROKE;
					ctx.textAlign = pt.x < width * 0.05 ? "left" : (pt.x < width * 0.95 ? "center" : "right");
					ctx.strokeText(_airports[i].icao, pt.x, pt.y + dY);
					ctx.fillText(_airports[i].icao, pt.x, pt.y + dY);
				}
			}

			// Draw aircrafts
			for (var i = 0, flight, timeNow = (new Date()).getTime(), colourAircraft,
					country, dY, lengthAxial, lengthLateral, pt, ptA, ptL, rotary, text, widthAircraft;
					i < _aircrafts.length; ++i)
				if (_aircrafts[i].bearing && _aircrafts[i].distance && _aircrafts[i].distance < _range) {
					flight = _aircrafts[i].flight && _aircrafts[i].flight.trim().length > 0 ?
							_aircrafts[i].flight.trim() : null;
					pt = this.getPointAtBearingDistance(mid, _aircrafts[i].bearing, _aircrafts[i].distance * scale);
					colourAircraft = this.COLOUR_AIRCRAFT;
					text = flight ? flight : "";
					text += (flight ? " [" : "") + _aircrafts[i].hex + (flight ? "]" : "");
					if (_aircrafts[i].squawk) {
						text += ", Squawk: " + _aircrafts[i].squawk;
						switch (Number(_aircrafts[i].squawk)) {
							case 7500:
								text += "\n* Hijacked";
								colourAircraft = this.COLOUR_AIRCRAFT_7500;
								break;
							case 7600:
								text += "\n* Radio Failure";
								colourAircraft = this.COLOUR_AIRCRAFT_7600;
								break;
							case 7700:
								text += "\n* Emergency";
								colourAircraft = this.COLOUR_AIRCRAFT_7700;
								break;
						}
					}
					country = this.getCountry(_aircrafts[i].hex);
					if (country)
						text += "\n" + country;
					if (_aircrafts[i].category && this.CATEGORY_AIRCRAFT[_aircrafts[i].category])
						text += (country ? ", " : "\n") + "Category: " + this.CATEGORY_AIRCRAFT[_aircrafts[i].category];
					if (_aircrafts[i].lon && _aircrafts[i].lat)
						text += "\n" + _aircrafts[i].lon.toFixed(5) + "\u00b0, " + _aircrafts[i].lat.toFixed(5) + "\u00b0";
					if (_aircrafts[i].altitude) {
						text += ", " + Math.round(_aircrafts[i].altitude).toLocaleString(undefined, {maximumFractionDigits: 0}) + "ft";
						if (_aircrafts[i].vert_rate)
							text += _aircrafts[i].vert_rate < 0 ? "\u25be" : (_aircrafts[i].vert_rate > 0 ? "\u25b4" : "");
					}
					if (_aircrafts[i].track)
						text += "\nTrack: " + Math.round(_aircrafts[i].track) % 360 + "\u00b0";
					if (_aircrafts[i].speed)
						text += (_aircrafts[i].track ? ", " : "\n") + "Speed: " + Math.round(_aircrafts[i].speed) + "Kts";
					text += "\nBearing: " + (Math.round(_aircrafts[i].bearing) % 360) + "\u00b0, Distance:" + _aircrafts[i].distance.toFixed(_aircrafts[i].distance < 10 ? 2 : 1).replace(/\.0+$/gm, "") + "NM";
					if (_aircrafts[i].messages)
						text += "\nMessages: " + Number(_aircrafts[i].messages).toLocaleString(undefined, {maximumFractionDigits: 0});
					if (_aircrafts[i].seen)
						text += (_aircrafts[i].messages ? ", " : "\n") + "Ago: " + Math.round(_aircrafts[i].seen + (timeNow - _timeAircrafts) / 1e3).toLocaleString(undefined, {maximumFractionDigits: 0}) + "s";
					if (_aircrafts[i].rssi)
						text += "\nRSSI: " + _aircrafts[i].rssi + "dBm";
					_pointInfo.push({x: pt.x, y: pt.y, action: "https://flightaware.com/live/modes/" + _aircrafts[i].hex + "/redirect", text: text});
					lengthAxial = this.LENGTH_AIRCRAFT_AXIAL;
					lengthLateral = this.LENGTH_AIRCRAFT_LATERAL;
					widthAircraft = this.WIDTH_AIRCRAFT;
					rotary = false;
					if (_aircrafts[i].category) { // Set aircraft type
						if (_aircrafts[i].category.match(/A(1|2)/g)) { // Light/Small
							lengthAxial *= 0.75;
							lengthLateral *= 0.75;
							widthAircraft *= 0.75;
						} else if (_aircrafts[i].category.match(/A3/ig)) { // Large
							lengthAxial *= 1.25;
							lengthLateral *= 1.25;
							widthAircraft *= 1.25;
						} else if (_aircrafts[i].category.match(/A7/ig)) // Rotorcraft
							rotary = true;
					}
					ptA = [
							this.getPointAtBearingDistance(pt, _aircrafts[i].track, lengthAxial / 2),
							this.getPointAtBearingDistance(pt, _aircrafts[i].track + 180, lengthAxial / 2)
					];
					if (!rotary) // Fixed wing
						ptL = [
								this.getPointAtBearingDistance(ptA[1], _aircrafts[i].track + 90, lengthLateral / 2),
								this.getPointAtBearingDistance(ptA[1], _aircrafts[i].track + 270, lengthLateral / 2)
						];
					else // Rotary wing
						ptL = this.getPointAtBearingDistance(pt, _aircrafts[i].track + 180, (lengthAxial - lengthLateral));
					for (var j = 0; j < 2; ++j) {
						if (_aircrafts[i].track) { // Draw line for track
							ctx.beginPath();
							ctx.lineCap = j ? "button" : "square";
							ctx.lineWidth = ctx.fillStyle = widthAircraft + (j ? 0 : this.SIZE_STROKE);
							ctx.strokeStyle = ctx.fillStyle = j ? colourAircraft : this.COLOUR_BACKGROUND;
							ctx.moveTo(ptA[0].x, ptA[0].y);
							ctx.lineTo(ptA[1].x, ptA[1].y);
							ctx.stroke();
							if (!rotary) { // Fixed wing
								ctx.beginPath();
								ctx.moveTo(ptL[0].x, ptL[0].y);
								ctx.lineTo(ptL[1].x, ptL[1].y);
								ctx.stroke();
							} else { // Rotary wing
								ctx.beginPath();
								ctx.arc(ptL.x, ptL.y, lengthLateral / 2 + (j ? 0 : this.SIZE_STROKE), 0, 2 * Math.PI);
								ctx.fill();
							}
						} else { // Draw dot
							ctx.beginPath();
							ctx.strokeStyle = ctx.fillStyle = j ? colourAircraft : this.COLOUR_BACKGROUND;
							ctx.arc(pt.x, pt.y, widthAircraft + (j ? 0 : this.SIZE_STROKE), 0, 2 * Math.PI);
							ctx.fill();
						}
					}
					if (flight) { // Draw aircraft flight No
						dY = pt.y < mid.y ? this.SIZE_TEXT + 4 : -6;
						ctx.lineWidth = this.SIZE_STROKE;
						ctx.strokeStyle = this.COLOUR_BACKGROUND;
						ctx.textAlign = pt.x < width * 0.1 ? "left" : (pt.x < width * 0.9 ? "center" : "right");
						ctx.strokeText(flight, pt.x, pt.y + dY);
						ctx.fillText(flight, pt.x, pt.y + dY);
					}
				}
		}
	};

	/** Method to get aircrafts*/
	this.getAircrafts = function() {
		return _aircrafts;
	};

	/** Method to get airports*/
	this.getAirports = function() {
		return _airports;
	};

	/** Method to get airports*/
	this.getShapes = function() {
		return _shapes;
	};

	/** Method to get action & title for given pixel*/
	this.getInfo = function(x, y) {
		for (var i = _pointInfo.length - 1; i >= 0 ; i--)
			if (Math.abs(x - _pointInfo[i].x) <= this.SIZE_HOVER && Math.abs(y - _pointInfo[i].y) <= this.SIZE_HOVER)
				return {action: _pointInfo[i].action, text: _pointInfo[i].text};
	};

	/** Method to set aircrafts*/
	this.setAircrafts = function(aircrafts, timeAircrafts) {
		_timeAircrafts = timeAircrafts || (new Date()).getTime();
		if (!(aircrafts instanceof Array))
			throw "Error: Array expected";
		_aircrafts = this.setBearingDistance(_site, aircrafts);
		if (typeof _range === "undefined") { // Set range if not set & trim flight No
			_range = this.STEP_RANGE;
			if (_aircrafts.length > 0)
				for (var i = 0; i < _aircrafts.length; ++i) {
					if (_aircrafts[i].distance && _range < _aircrafts[i].distance && _aircrafts[i].distance < this.MAX_RANGE)
						_range = Math.ceil(_aircrafts[i].distance / this.STEP_RANGE) * this.STEP_RANGE;
				}
		}
	};

	/** Method to set airports*/
	this.setAirports = function(airports) {
		if (!(airports instanceof Array))
			throw "Error: Array expected";
		_airports = this.setBearingDistance(_site, airports);
	};

	/** Method to set onClick*/
	this.setOnClick = function(onClick) {
		if (typeof onClick !== "function")
			throw "Error: Function expected";
		_onClick = onClick;
	};


	/** Method to set shapes*/
	this.setShapes = function(shapes) {
		/*	[ // i
					[ // j
						[12.34,56.78], // k
						[23.45,67.89]
					],...
				]*/
		if (!(shapes instanceof Array))
			throw "Error: Array expected";
		_shapes = shapes;
		for (var i = 0; i < shapes.length; ++i)
			if (shapes[i] instanceof Array)
				_shapes[i] = this.setBearingDistance(_site, _shapes[i], true);
	}

	/** Method to zoom out*/
	this.zoomIn = function() {
		if (_range > this.STEP_RANGE) {
			_range -= this.STEP_RANGE;
			that.draw();
			return true;
		}
		return false;
	};

	/** Method to zoom out*/
	this.zoomOut = function() {
		if (_range < this.MAX_RANGE) {
			_range += this.STEP_RANGE;
			that.draw();
			return true;
		}
		return false;
	};

	_canvas.onclick = function() { // Action on click
		var pt = that.getPoint(event, this),
				info = that.getInfo(pt.x - 5, pt.y -5);
		if (info && info.action) //  Clicked airport/aircraft
			window.open(info.action, "_blank");
		else if (_onClick) // Generic click
			_onClick(pt);
	};

	_canvas.onmousemove = function() { // Set title on hover of airport/aircraft
		var pt = that.getPoint(event, this),
				dX = (_canvas.offsetWidth - _canvas.width) / 2,
				dY = (_canvas.offsetHeight - _canvas.height) / 2,
				info = that.getInfo(pt.x - dX, pt.y - dY);
		_canvas.title = info && info.text ? info.text : "";
	};

	_canvas.onpointerdown = function(event) { // Handle pointer down for pinch
		event.preventDefault();
		_cacheEvent.push(event);
	};
	_canvas.onpointermove = function(event) { // Handle pointer move for pinch
		for (var i = 0; i < _cacheEvent.length; ++i) // Find this event in cache & update it with event
			if (event.pointerId === _cacheEvent[i].pointerId) {
				_cacheEvent[i] = event;
				break;
			}
		if (_cacheEvent.length === 2) { // If two pointers are down, check for pinch gestures
			// Calculate distance between two pointers
			var deltaPointerEvent = Math.hypot(_cacheEvent[0].clientX - _cacheEvent[1].clientX, _cacheEvent[0].clientY - _cacheEvent[1].clientY);
			if (_lastDeltaPointerEvent > 0) {
				if (deltaPointerEvent > _lastDeltaPointerEvent + that.MIN_EVENT_DELTA_PINCH) // Distance has increased: Zoom in
					that.zoomIn();
				if (deltaPointerEvent < _lastDeltaPointerEvent - that.MIN_EVENT_DELTA_PINCH) // Distance has decreased: Zoom out
					that.zoomOut();
			}
			_lastDeltaPointerEvent = deltaPointerEvent; // Cache distance
		}
	};
	_canvas.onpointerup = _canvas.onpointercancel = _canvas.onpointerout
			= _canvas.onpointerleave = function(event) { // Handle pointer up, cancel, out & leave
		for (var i = 0; i < _cacheEvent.length; ++i) // Remove this pointer from cache & reset target's
			if (_cacheEvent[i].pointerId === event.pointerId) {
				_cacheEvent.splice(i, 1);
				break;
			}
		if (_cacheEvent.length < 2) // If number of pointers down less than two reset last delta
			_lastDeltaPointerEvent = -1;
	};

	_canvas.onwheel = function() { // Zoom-in/Zoom-out on mouse wheel
		event.preventDefault();
		if (event.deltaY < 0)
			that.zoomIn();
		else
			that.zoomOut();
	};
}
RadarView.prototype = {
	/** Method to return bearing & distance (m) (Haversine/Spherical earth)*/
	getBearingDistance: function(start, end) {
		var phi1 = Math.toRadians(start.lat),
				phi2 = Math.toRadians(end.lat),
				deltaPhi = Math.toRadians(end.lat - start.lat),
				deltaLambda = Math.toRadians(end.lon - start.lon),
				a1 = Math.toDegrees(Math.atan2(Math.sin(deltaLambda) * Math.cos(phi2), Math.cos(phi1)
					* Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda))),
				a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) + Math.cos(Math.toRadians(start.lat))
					* Math.cos(Math.toRadians(end.lat)) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2),
				s = 6371008.77 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
		while (a1 < 0)
			a1 += 360;
		return {bearing: s > 0 ? a1 % 360 : Number.NaN,
				distance: s};
	},
	/** Method to get country name for given ICAO hex - modified from Dump1090's 'flag.js'*/
	getCountry: function(icao) {
		for (var i = 0, hex = +("0x" + icao); i < this.RANGE_COUNTRY_ICAO.length; ++i)
			if (hex >= this.RANGE_COUNTRY_ICAO[i].start && hex <= this.RANGE_COUNTRY_ICAO[i].end)
				return this.RANGE_COUNTRY_ICAO[i].country;
	},
	/** Method to return pt of event with respect to canvas */
	getPoint: function(event, element) {
		return {x: event.offsetX ? event.offsetX : event.pageX - element.offsetLeft,
				y: event.offsetY ? event.offsetY : event.pageY - element.offsetTop}; 
	},
	/** Method to return a point {x, y} at given bearing & distance (pixels) from given origin {x, y}*/
	getPointAtBearingDistance: function(origin, bearing, distance) {
		return {x: origin.x + Math.sin(Math.toRadians(bearing)) * distance,
				y: origin.y - Math.cos(Math.toRadians(bearing)) * distance};
	},
	/** Method to return an array of objects with bearing & distance (NM) set with respect to a start*/
	setBearingDistance: function(start, array, noSort /* optional */) {
		for (var i = 0, bd; i < array.length; ++i)
			if (start.lon && start.lat && ((array[i].lon && array[i].lat)
					|| (array[i] instanceof Array && array[i].length === 2))) {
				bd = this.getBearingDistance(start, (array[i].lon && array[i].lat ? array[i] : {lon: array[i][0], lat: array[i][1]}));
				array[i].bearing = bd.bearing;
				array[i].distance = bd.distance / 1e3 * 0.5399568035; // NM
			}
		if (typeof noSort !== "boolean" || !noSort)
			array.sort(function (a, b) { // Sort with least distance last (for drawing order)
				if (!a.distance && b.distance)
					return -1;
				else if (a.distance && !b.distance)
					return 1;
				return b.distance - a.distance;
			});
		return array;
	},
	COLOUR_AIRCRAFT: "#0f0",
	COLOUR_AIRCRAFT_7500: "red",
	COLOUR_AIRCRAFT_7600: "#ff0",
	COLOUR_AIRCRAFT_7700: "#ff4500",
	COLOUR_AIRPORT: "#0a0",
	COLOUR_GRATICULE: "#070",
	COLOUR_BACKGROUND: "#000",
	COLOUR_SHAPE: "#444",
	LENGTH_AIRCRAFT_AXIAL: 8, // Length of aircraft to draw axially
	LENGTH_AIRCRAFT_LATERAL: 6, // Length of aircraft to draw laterally
	MAX_RANGE: 300, // Maximum range (NM),
	MIN_EVENT_DELTA_PINCH: 3, // Minimum change in event pixel for pinch
	SIZE_AIRPORT: 2,
	SIZE_HOVER: 4, // Radius of title hotspot (px)
	SIZE_STROKE: 2,
	SIZE_TEXT: 10,
	STEP_RANGE: 50, // Range of rings (NM)
	WIDTH_AIRCRAFT: 2,
	WIDTH_LINES: 1,
	CATEGORY_AIRCRAFT: { // Type of aircraft as per ADS-B category
		"A1": "Light",
		"A2": "Small",
		"A3": "Large",
		"A4": "High",
		"A5": "Heavy",
		"A6": "High Performance",
		"A7": "Rotorcraft"
	},
	RANGE_COUNTRY_ICAO: [ // Country ICAO range - based on Dump1090's 'flag.js'
		{start: 0x700000, end: 0x700FFF, country: "Afghanistan"},
		{start: 0x501000, end: 0x5013FF, country: "Albania"},
		{start: 0x0A0000, end: 0x0A7FFF, country: "Algeria"},
		{start: 0x090000, end: 0x090FFF, country: "Angola"},
		{start: 0x0CA000, end: 0x0CA3FF, country: "Antigua & Barbuda"},
		{start: 0xE00000, end: 0xE3FFFF, country: "Argentina"},
		{start: 0x600000, end: 0x6003FF, country: "Armenia"},
		{start: 0x7C0000, end: 0x7FFFFF, country: "Australia"},
		{start: 0x440000, end: 0x447FFF, country: "Austria"},
		{start: 0x600800, end: 0x600BFF, country: "Azerbaijan"},
		{start: 0x0A8000, end: 0x0A8FFF, country: "Bahamas"},
		{start: 0x894000, end: 0x894FFF, country: "Bahrain"},
		{start: 0x702000, end: 0x702FFF, country: "Bangladesh"},
		{start: 0x0AA000, end: 0x0AA3FF, country: "Barbados"},
		{start: 0x510000, end: 0x5103FF, country: "Belarus"},
		{start: 0x448000, end: 0x44FFFF, country: "Belgium"},
		{start: 0x0AB000, end: 0x0AB3FF, country: "Belize"},
		{start: 0x094000, end: 0x0943FF, country: "Benin"},
		{start: 0x680000, end: 0x6803FF, country: "Bhutan"},
		{start: 0xE94000, end: 0xE94FFF, country: "Bolivia"},
		{start: 0x513000, end: 0x5133FF, country: "Bosnia & Herzegovina"},
		{start: 0x030000, end: 0x0303FF, country: "Botswana"},
		{start: 0xE40000, end: 0xE7FFFF, country: "Brazil"},
		{start: 0x895000, end: 0x8953FF, country: "Brunei Darussalam"},
		{start: 0x450000, end: 0x457FFF, country: "Bulgaria"},
		{start: 0x09C000, end: 0x09CFFF, country: "Burkina Faso"},
		{start: 0x032000, end: 0x032FFF, country: "Burundi"},
		{start: 0x70E000, end: 0x70EFFF, country: "Cambodia"},
		{start: 0x034000, end: 0x034FFF, country: "Cameroon"},
		{start: 0xC00000, end: 0xC3FFFF, country: "Canada"},
		{start: 0x096000, end: 0x0963FF, country: "Cape Verde"},
		{start: 0x06C000, end: 0x06CFFF, country: "Central African Republic"},
		{start: 0x084000, end: 0x084FFF, country: "Chad"},
		{start: 0xE80000, end: 0xE80FFF, country: "Chile"},
		{start: 0x780000, end: 0x7BFFFF, country: "China"},
		{start: 0x0AC000, end: 0x0ACFFF, country: "Colombia"},
		{start: 0x035000, end: 0x0353FF, country: "Comoros"},
		{start: 0x036000, end: 0x036FFF, country: "Congo"}, // probably?
		{start: 0x901000, end: 0x9013FF, country: "Cook Islands"},
		{start: 0x0AE000, end: 0x0AEFFF, country: "Costa Rica"},
		{start: 0x038000, end: 0x038FFF, country: "Cote d'Ivoire"},
		{start: 0x501C00, end: 0x501FFF, country: "Croatia"},
		{start: 0x0B0000, end: 0x0B0FFF, country: "Cuba"},
		{start: 0x4C8000, end: 0x4C83FF, country: "Cyprus"},
		{start: 0x498000, end: 0x49FFFF, country: "Czech Republic"},
		{start: 0x720000, end: 0x727FFF, country: "North Korea"},
		{start: 0x08C000, end: 0x08CFFF, country: "DR Congo"},
		{start: 0x458000, end: 0x45FFFF, country: "Denmark"},
		{start: 0x098000, end: 0x0983FF, country: "Djibouti"},
		{start: 0x0C4000, end: 0x0C4FFF, country: "Dominican Republic"},
		{start: 0xE84000, end: 0xE84FFF, country: "Ecuador"},
		{start: 0x010000, end: 0x017FFF, country: "Egypt"},
		{start: 0x0B2000, end: 0x0B2FFF, country: "El Salvador"},
		{start: 0x042000, end: 0x042FFF, country: "Equatorial Guinea"},
		{start: 0x202000, end: 0x2023FF, country: "Eritrea"},
		{start: 0x511000, end: 0x5113FF, country: "Estonia"},
		{start: 0x040000, end: 0x040FFF, country: "Ethiopia"},
		{start: 0xC88000, end: 0xC88FFF, country: "Fiji"},
		{start: 0x460000, end: 0x467FFF, country: "Finland"},
		{start: 0x380000, end: 0x3BFFFF, country: "France"},
		{start: 0x03E000, end: 0x03EFFF, country: "Gabon"},
		{start: 0x09A000, end: 0x09AFFF, country: "Gambia"},
		{start: 0x514000, end: 0x5143FF, country: "Georgia"},
		{start: 0x3C0000, end: 0x3FFFFF, country: "Germany"},
		{start: 0x044000, end: 0x044FFF, country: "Ghana"},
		{start: 0x468000, end: 0x46FFFF, country: "Greece"},
		{start: 0x0CC000, end: 0x0CC3FF, country: "Grenada"},
		{start: 0x0B4000, end: 0x0B4FFF, country: "Guatemala"},
		{start: 0x046000, end: 0x046FFF, country: "Guinea"},
		{start: 0x048000, end: 0x0483FF, country: "Guinea-Bissau"},
		{start: 0x0B6000, end: 0x0B6FFF, country: "Guyana"},
		{start: 0x0B8000, end: 0x0B8FFF, country: "Haiti"},
		{start: 0x0BA000, end: 0x0BAFFF, country: "Honduras"},
		{start: 0x470000, end: 0x477FFF, country: "Hungary"},
		{start: 0x4CC000, end: 0x4CCFFF, country: "Iceland"},
		{start: 0x800000, end: 0x83FFFF, country: "India"},
		{start: 0x8A0000, end: 0x8A7FFF, country: "Indonesia"},
		{start: 0x730000, end: 0x737FFF, country: "Iran"},
		{start: 0x728000, end: 0x72FFFF, country: "Iraq"},
		{start: 0x4CA000, end: 0x4CAFFF, country: "Ireland"},
		{start: 0x738000, end: 0x73FFFF, country: "Israel"},
		{start: 0x300000, end: 0x33FFFF, country: "Italy"},
		{start: 0x0BE000, end: 0x0BEFFF, country: "Jamaica"},
		{start: 0x840000, end: 0x87FFFF, country: "Japan"},
		{start: 0x740000, end: 0x747FFF, country: "Jordan"},
		{start: 0x683000, end: 0x6833FF, country: "Kazakhstan"},
		{start: 0x04C000, end: 0x04CFFF, country: "Kenya"},
		{start: 0xC8E000, end: 0xC8E3FF, country: "Kiribati"},
		{start: 0x706000, end: 0x706FFF, country: "Kuwait"},
		{start: 0x601000, end: 0x6013FF, country: "Kyrgyzstan"},
		{start: 0x708000, end: 0x708FFF, country: "Laos"},
		{start: 0x502C00, end: 0x502FFF, country: "Latvia"},
		{start: 0x748000, end: 0x74FFFF, country: "Lebanon"},
		{start: 0x04A000, end: 0x04A3FF, country: "Lesotho"},
		{start: 0x050000, end: 0x050FFF, country: "Liberia"},
		{start: 0x018000, end: 0x01FFFF, country: "Libya"},
		{start: 0x503C00, end: 0x503FFF, country: "Lithuania"},
		{start: 0x4D0000, end: 0x4D03FF, country: "Luxembourg"},
		{start: 0x054000, end: 0x054FFF, country: "Madagascar"},
		{start: 0x058000, end: 0x058FFF, country: "Malawi"},
		{start: 0x750000, end: 0x757FFF, country: "Malaysia"},
		{start: 0x05A000, end: 0x05A3FF, country: "Maldives"},
		{start: 0x05C000, end: 0x05CFFF, country: "Mali"},
		{start: 0x4D2000, end: 0x4D23FF, country: "Malta"},
		{start: 0x900000, end: 0x9003FF, country: "Marshall Islands"},
		{start: 0x05E000, end: 0x05E3FF, country: "Mauritania"},
		{start: 0x060000, end: 0x0603FF, country: "Mauritius"},
		{start: 0x0D0000, end: 0x0D7FFF, country: "Mexico"},
		{start: 0x681000, end: 0x6813FF, country: "Micronesia"},
		{start: 0x4D4000, end: 0x4D43FF, country: "Monaco"},
		{start: 0x682000, end: 0x6823FF, country: "Mongolia"},
		{start: 0x516000, end: 0x5163FF, country: "Montenegro"},
		{start: 0x020000, end: 0x027FFF, country: "Morocco"},
		{start: 0x006000, end: 0x006FFF, country: "Mozambique"},
		{start: 0x704000, end: 0x704FFF, country: "Myanmar"},
		{start: 0x201000, end: 0x2013FF, country: "Namibia"},
		{start: 0xC8A000, end: 0xC8A3FF, country: "Nauru"},
		{start: 0x70A000, end: 0x70AFFF, country: "Nepal"},
		{start: 0x480000, end: 0x487FFF, country: "Netherlands"},
		{start: 0xC80000, end: 0xC87FFF, country: "New Zealand"},
		{start: 0x0C0000, end: 0x0C0FFF, country: "Nicaragua"},
		{start: 0x062000, end: 0x062FFF, country: "Niger"},
		{start: 0x064000, end: 0x064FFF, country: "Nigeria"},
		{start: 0x512000, end: 0x5123FF, country: "North Macedonia"},
		{start: 0x478000, end: 0x47FFFF, country: "Norway"},
		{start: 0x70C000, end: 0x70C3FF, country: "Oman"},
		{start: 0x760000, end: 0x767FFF, country: "Pakistan"},
		{start: 0x684000, end: 0x6843FF, country: "Palau"},
		{start: 0x0C2000, end: 0x0C2FFF, country: "Panama"},
		{start: 0x898000, end: 0x898FFF, country: "Papua New Guinea"},
		{start: 0xE88000, end: 0xE88FFF, country: "Paraguay"},
		{start: 0xE8C000, end: 0xE8CFFF, country: "Peru"},
		{start: 0x758000, end: 0x75FFFF, country: "Philippines"},
		{start: 0x488000, end: 0x48FFFF, country: "Poland"},
		{start: 0x490000, end: 0x497FFF, country: "Portugal"},
		{start: 0x06A000, end: 0x06A3FF, country: "Qatar"},
		{start: 0x718000, end: 0x71FFFF, country: "South Korea"},
		{start: 0x504C00, end: 0x504FFF, country: "Moldova"},
		{start: 0x4A0000, end: 0x4A7FFF, country: "Romania"},
		{start: 0x100000, end: 0x1FFFFF, country: "Russia"},
		{start: 0x06E000, end: 0x06EFFF, country: "Rwanda"},
		{start: 0xC8C000, end: 0xC8C3FF, country: "St Lucia"},
		{start: 0x0BC000, end: 0x0BC3FF, country: "St Vincent & the Grenadines"},
		{start: 0x902000, end: 0x9023FF, country: "Samoa"},
		{start: 0x500000, end: 0x5003FF, country: "San Marino"},
		{start: 0x09E000, end: 0x09E3FF, country: "Sao Tome & Principe"},
		{start: 0x710000, end: 0x717FFF, country: "Saudi Arabia"},
		{start: 0x070000, end: 0x070FFF, country: "Senegal"},
		{start: 0x4C0000, end: 0x4C7FFF, country: "Serbia"},
		{start: 0x074000, end: 0x0743FF, country: "Seychelles"},
		{start: 0x076000, end: 0x0763FF, country: "Sierra Leone"},
		{start: 0x768000, end: 0x76FFFF, country: "Singapore"},
		{start: 0x505C00, end: 0x505FFF, country: "Slovakia"},
		{start: 0x506C00, end: 0x506FFF, country: "Slovenia"},
		{start: 0x897000, end: 0x8973FF, country: "Solomon Islands"},
		{start: 0x078000, end: 0x078FFF, country: "Somalia"},
		{start: 0x008000, end: 0x00FFFF, country: "South Africa"},
		{start: 0x340000, end: 0x37FFFF, country: "Spain"},
		{start: 0x770000, end: 0x777FFF, country: "Sri Lanka"},
		{start: 0x07C000, end: 0x07CFFF, country: "Sudan"},
		{start: 0x0C8000, end: 0x0C8FFF, country: "Suriname"},
		{start: 0x07A000, end: 0x07A3FF, country: "Swaziland"},
		{start: 0x4A8000, end: 0x4AFFFF, country: "Sweden"},
		{start: 0x4B0000, end: 0x4B7FFF, country: "Switzerland"},
		{start: 0x778000, end: 0x77FFFF, country: "Syria"},
		{start: 0x515000, end: 0x5153FF, country: "Tajikistan"},
		{start: 0x880000, end: 0x887FFF, country: "Thailand"},
		{start: 0x088000, end: 0x088FFF, country: "Togo"},
		{start: 0xC8D000, end: 0xC8D3FF, country: "Tonga"},
		{start: 0x0C6000, end: 0x0C6FFF, country: "Trinidad & Tobago"},
		{start: 0x028000, end: 0x02FFFF, country: "Tunisia"},
		{start: 0x4B8000, end: 0x4BFFFF, country: "Turkey"},
		{start: 0x601800, end: 0x601BFF, country: "Turkmenistan"},
		{start: 0x068000, end: 0x068FFF, country: "Uganda"},
		{start: 0x508000, end: 0x50FFFF, country: "Ukraine"},
		{start: 0x896000, end: 0x896FFF, country: "UAE"},
		{start: 0x400000, end: 0x43FFFF, country: "UK"},
		{start: 0x080000, end: 0x080FFF, country: "Tanzania"},
		{start: 0xA00000, end: 0xAFFFFF, country: "USA"},
		{start: 0xE90000, end: 0xE90FFF, country: "Uruguay"},
		{start: 0x507C00, end: 0x507FFF, country: "Uzbekistan"},
		{start: 0xC90000, end: 0xC903FF, country: "Vanuatu"},
		{start: 0x0D8000, end: 0x0DFFFF, country: "Venezuela"},
		{start: 0x888000, end: 0x88FFFF, country: "Viet Nam"},
		{start: 0x890000, end: 0x890FFF, country: "Yemen"},
		{start: 0x08A000, end: 0x08AFFF, country: "Zambia"},
		{start: 0x004000, end: 0x0043FF, country: "Zimbabwe"}
	]
};
