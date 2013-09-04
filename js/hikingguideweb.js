/* Global variables */

var map;
var tracklayer;
var storage;
var tracks;
var limits;
var positionlayer;
var layerswitchercontrol;
var geolocate
var firstgeolocation;
var lastx,lasty;
var lastcircle,lastcross;
var lastdirection=null;
var geolocatechecktimer;
var geolocatefailed;
var trackparser;
var layerswitchersenlarged;
var layerswitcherenlargeinterval=null;
var localizationchecktimer;
var mozL10n=navigator.mozL10n;
document.getElementById("body").onload=WaitForLocalizationToLoad;
OpenLayers.Renderer.symbol.arrow = [0, 0, -8, 8, 0, -20, 8, 8, 0, 0];

/* Function to recreate track layer when it changes */

function AddTrackLayerByFileOrDataUrl(file)
{

	/* Delete previous track layer */

	map.removeLayer(map.getLayersBy('name',mozL10n.get('main-track-layer-name'))[0]);

	/* Create and add track layer from passed file */

	tracklayer=new OpenLayers.Layer.Vector(
		mozL10n.get('main-track-layer-name'),
		{
			strategies:
			[
				new OpenLayers.Strategy.Fixed()
			],
			protocol: new OpenLayers.Protocol.HTTP(
				{
					url: file,
					format: trackparser
				}
			),
			style: {
				strokeColor: "red",
				strokeWidth: 5,
				strokeOpacity: 0.5
			}
		}
	);
	map.addLayer(tracklayer);

	/* When layer loaded, zoom to whole extent of track plus position */

	tracklayer.events.register(
		"loadend",
		tracklayer,
		function()
		{
			limits=this.getDataExtent();
			limits.extend(this.map.getLayersBy('name',mozL10n.get('main-position-layer-name'))[0].getDataExtent());
			this.map.zoomToExtent(limits);
		}
	);

	/* Change track layer depth position, depending on whether Google Maps layers are visualized (that is, whether online or not) */

	if (navigator.onLine)
	{
		map.setLayerIndex(tracklayer,5);
	}
	else
	{
		map.setLayerIndex(tracklayer,1);
	};

};

/* Function to recreate track layer when it changes */

function AddTrackLayerByFeatures(features)
{

	/* Delete previous track */

	tracklayer.removeAllFeatures();

	/* When features added, zoom to whole extent of track plus position */

	tracklayer.events.register(
		"featuresadded",
		tracklayer,
		function()
		{
			limits=this.getDataExtent();
			limits.extend(this.map.getLayersBy('name',mozL10n.get('main-position-layer-name'))[0].getDataExtent());
			this.map.zoomToExtent(limits);
		}
	);

	/* Add passed features */

	tracklayer.addFeatures(features);

};

/* Function to select a track file from the SD card */

function UpdateTrackFiles()
{
	storage=navigator.getDeviceStorage("sdcard");
	if (storage)
	{
		var trackscursor=storage.enumerate("tracks");
		tracks=[];
		trackscursor.onerror=function()
		{
			console.error("Error in Device Storage API",trackscursor.error.name);
		};
		trackscursor.onsuccess=function()
		{
			if (!trackscursor.result)
			{
				for (trackindex in tracks)
				{
					document.getElementById('trackfileselect').options[document.getElementById('trackfileselect').options.length]=new Option(tracks[trackindex].name,trackindex);
				};
				return;
			};
			var file=trackscursor.result;
			if (file.name.split('.').pop()=="gpx" || file.name.split('.').pop()=="kml")
			{
				tracks.push(file);
			};
			trackscursor.continue();
			return;
		};
	};
	return false;
};

/* Function to open track file and launch recreation of track layer in a normal navigator (input type="file") */

function NewTrackFileByInput(evt)
{
	f=evt.target.files[0];
	if (f.name.split('.').pop()=="gpx")
	{
		trackparser=new OpenLayers.Format.GPX();
	}
	else if (f.name.split('.').pop()=="kml")
	{
		trackparser=new OpenLayers.Format.KML();
	};
	reader=new FileReader();
	reader.onload=function(e)
	{
		var trackfeatures=trackparser.read(e.target.result);
		for (trackfeatureindex in trackfeatures)
		{
			trackfeatures[trackfeatureindex].geometry.transform(new OpenLayers.Projection("EPSG:4326"), new OpenLayers.Projection("EPSG:900913"));
		};
		AddTrackLayerByFeatures(trackfeatures);
	};
	reader.readAsText(f);
};

/* Function to open track file and launch recreation of track layer in FirefoxOS (select) */

function NewTrackFileBySelect(evt)
{
	f=tracks[document.getElementById('trackfileselect').value];
	if (f.name.split('.').pop()=="gpx")
	{
		trackparser=new OpenLayers.Format.GPX();
	}
	else if (f.name.split('.').pop()=="kml")
	{
		trackparser=new OpenLayers.Format.KML();
	};
	reader=new FileReader();
	reader.onload=function(e)
	{
		var trackfeatures=trackparser.read(e.target.result);
		for (trackfeatureindex in trackfeatures)
		{
			trackfeatures[trackfeatureindex].geometry.transform(new OpenLayers.Projection("EPSG:4326"), new OpenLayers.Projection("EPSG:900913"));
		};
		AddTrackLayerByFeatures(trackfeatures);
	};
	reader.readAsText(f);
};

/* Function to open track file and launch recreation of track layer in FirefoxOS without permissions from a file in the server (input type="text") */

function NewTrackFileByKeyboard(evt)
{
	AddTrackLayerByFileOrDataUrl('tracks/'+document.getElementById('trackfile').value+'.gpx');
};

/* Function to animate position precision circle */

function PulsatePrecisionCircle(feature)
{
	point=feature.geometry.getCentroid();
	bounds=feature.geometry.getBounds();
	radius=Math.abs((bounds.right-bounds.left)/2);
	count=0;
	grow='up';
	resize=function()
	{
		if (count>16)
		{
			clearInterval(window.resizeInterval);
		};
		interval=radius*0.03;
		ratio=interval/radius;
		switch (count)
		{
			case 4:
			case 12:
				grow='down';
				break;
			case 8:
				grow='up';
				break;
		};
		if (grow!=='up')
		{
			ratio=-Math.abs(ratio);
		};
		feature.geometry.resize(1+ratio,point);
		positionlayer.drawFeature(feature);
		count++;
	};
	window.resizeInterval=window.setInterval(resize,50,point,radius);
};

/* Funtion to draw position when updated */

function PositionUpdated(e)
{

	/* Delete last position drawings and add line if not first time */

	if (firstgeolocation==false)
	{
		positionlayer.removeFeatures(lastcircle);
		positionlayer.removeFeatures(lastcross);
		positionlayer.addFeatures([
			new OpenLayers.Feature.Vector(
				new OpenLayers.Geometry.LineString([
					new OpenLayers.Geometry.Point(lastx,lasty),
					new OpenLayers.Geometry.Point(e.point.x,e.point.y)
				]),
				{},
				{
					strokeColor: "blue",
					strokeWidth: 5,
					strokeOpacity: 0.5
				}
			)
		]);
	};

	/* Draw new position drawings */

	circle=new OpenLayers.Feature.Vector(
		OpenLayers.Geometry.Polygon.createRegularPolygon(
			new OpenLayers.Geometry.Point(e.point.x,e.point.y),
			e.position.coords.accuracy/2,
			40,
			0
		),
		{},
		{
			fillColor: '#000',
			fillOpacity: 0.1,
			strokeWidth: 0
		}
	);
	var direction;
	var icon;
	if (geolocate.watch)
	{
		if (e.position.heading!=NaN && e.position.heading!=null)
		{
			icon='arrow';
			direction=e.position.heading;
			lastdirection=direction;
		}
		else
		{
			if (firstgeolocation)
			{
				icon='cross';
				direction=0;
				lastdirection=null;
			}
			else
			{
				var dx=e.point.x-lastx;
				var dy=e.point.y-lasty;
				if (dx!=0 || dy!=0)
				{
					icon='arrow';
					direction=90-(Math.atan2(dy,dx)*180/Math.PI);
					lastdirection=direction;
				}
				else
				{
					if (lastdirection!=null)
					{
						icon='arrow';
						direction=lastdirection;
					}
					else
					{
						icon='cross';
						direction=0;
					};
				};
			};
		};
	}
	else
	{
		icon='cross';
		direction=0;
		lastdirection=null;
	};
	cross=new OpenLayers.Feature.Vector(
		e.point,
		{},
		{
			graphicName: icon,
			strokeColor: '#00f',
			strokeWidth: 2,
			fillColor: '#00f',
			fillOpacity: 1,
			pointRadius: 20,
			rotation: direction
		}
	);
	positionlayer.addFeatures([cross,circle]);
	lastcircle=circle;
	lastcross=cross;

	/* When first time, zoom to whole extent of track plus position and animate position precision circle */

	if (firstgeolocation)
	{
		limits=positionlayer.getDataExtent();
		limits.extend(map.getLayersBy('name',mozL10n.get('main-track-layer-name'))[0].getDataExtent());
		map.zoomToExtent(limits);
		PulsatePrecisionCircle(circle);
		firstgeolocation=false;
		this.bind=true;
	}

	/* Save this position */

	lastx=e.point.x;
	lasty=e.point.y;

};

/* Function to update position manually */

function ManualPositionUpdate()
{
	positionlayer.removeAllFeatures();
	geolocate.deactivate();
	geolocate.watch=false;
	firstgeolocation=true;
	geolocate.activate();
};

/* Activate automatic position update */

function AutomaticPositionUpdate()
{
	positionlayer.removeAllFeatures();
	if (geolocatechecktimer!=null)
	{
		clearInterval(geolocatechecktimer);
	};
	geolocate.deactivate();
	geolocate.watch=false;
	geolocatefailed=false;
	if (document.getElementById("autolocate").checked)
	{
		geolocate.watch=true;
		firstgeolocation=true;
		geolocate.activate();
		geolocatechecktimer=setInterval(TimerGeolocateCheck,5000);
	};
};

/* Play or pause automatic position update */

function PositionUpdatePlayPause()
{
	if (document.getElementById('locateplaypause').classList.contains('pause-btn'))
	{
		document.getElementById('locateplaypause').classList.remove('pause-btn');
		document.getElementById('locateplaypause').classList.add('play-btn');
		geolocatefailed=false;
		clearInterval(geolocatechecktimer);
		geolocate.deactivate();
	}
	else
	{
		document.getElementById('locateplaypause').classList.add('pause-btn');
		document.getElementById('locateplaypause').classList.remove('play-btn');
		geolocatefailed=false;
		geolocatechecktimer=setInterval(TimerGeolocateCheck,5000);
		geolocate.activate();
	};
};

/* Restart automatic position update */

function PositionUpdateRestart()
{
	if (geolocate.watch)
	{
		geolocatefailed=true;
	};
};

/* Periodically restart automatic position update if not active */

function TimerGeolocateCheck()
{
	if (geolocate.watch && geolocatefailed)
	{
		geolocate.deactivate();
		geolocate.activate();
		geolocatefailed=false;
	};
};

/* Delete recorded way */

function WayDelete()
{
	positionlayer.removeAllFeatures();
};

/* Function to open the Settings screen */

function OpenSettings()
{
	var container=document.getElementById('container');
	setTimeout(
		function()
		{
			container.classList.add('opensettings');
		},
		300
	);
};

/* Function to close the Settings screen */

function EndSettings()
{
	AutomaticPositionUpdate();
	document.getElementById("bottom-toolbar").classList.remove('invisible');
	if (document.getElementById("autolocate").checked)
	{
		document.getElementById("locate").classList.add('invisible');
		document.getElementById("locateplaypause").classList.remove('invisible');
		document.getElementById("waydelete").classList.remove('invisible');
	}
	else
	{
		document.getElementById("locate").classList.remove('invisible');
		document.getElementById("locateplaypause").classList.add('invisible');
		document.getElementById("waydelete").classList.add('invisible');
	};
	container=document.getElementById('container');
	setTimeout(
		function()
		{
			container.classList.add('closesettings');
			setTimeout(
				function()
				{
					container.classList.remove('opensettings')
					container.classList.remove('closesettings');
				},
				500
			);
		},
		300
	);
};

/* Puts OpenLayers' radio buttons and checkboxes inside label elements, so that they can be enlarged */

function EnlargeLayerSwitcher()
{
	if (layerswitcherenlargeinterval==null)
	{
		layerswitchersenlarged=0;
		layerswitcherenlargeinterval=setInterval(TryEnlargeLayerSwitcher,10);
	};
};

function TryEnlargeLayerSwitcher()
{
	var inputs=document.getElementsByTagName('input');
	for (var i=0;i<inputs.length;i++)
	{
		if ((inputs[i].getAttribute('type')=='radio' || inputs[i].getAttribute('type')=='checkbox') && inputs[i].parentNode.tagName!='LABEL')
		{
			var labelnode=document.createElement('label');
			labelnode.id='label_'+inputs[i].id;
			inputs[i].parentNode.insertBefore(labelnode,inputs[i]);
			labelnode.appendChild(inputs[i]);
			var spannode=document.createElement('span');
			labelnode.appendChild(spannode);
			if (inputs[i].getAttribute('type')=='radio')
			{
				labelnode.onclick=function()
				{
					map.setBaseLayer(map.getLayer(this.getElementsByTagName('input')[0]._layer));
				};
			}
			else
			{
				labelnode.onclick=function()
				{
					map.getLayer(this.getElementsByTagName('input')[0]._layer).display(this.getElementsByTagName('input')[0].checked);
				};
			};
/*			var nextlabelnode=labelnode.nextSibling;
			while (nextlabelnode.nodeType!=Node.ELEMENT_NODE || nextlabelnode.tagName!='LABEL')
			{
				nextlabelnode=nextlabelnode.nextSibling;
			};
			if (inputs[i].getAttribute('type')=='radio')
			{
				nextlabelnode.onclick=function()
				{
					map.setBaseLayer(map.getLayer(this._layer));
				};
			}
			else
			{
				nextlabelnode.onclick=function()
				{
					map.getLayer(this._layer).display(this.checked);
				};
			};*/
			layerswitchersenlarged=layerswitchersenlarged+1;
		};
	};
	googleelements=document.getElementsByClassName('olLayerGoogleV3');
	for (var i=0;i<googleelements.length;i++)
	{
		googleelements[i].setAttribute('style',googleelements[i].getAttribute('style').replace('right: 138px;','').replace('bottom: 0px;','').replace('left: 0px;','').replace('z-index: 1100;','z-index: 1000;'));
	};
	if (layerswitchersenlarged==map.layers.length)
	{
		clearInterval(layerswitcherenlargeinterval);
		layerswitcherenlargeinterval=null;
	};
};


/* Wait for localization to be loaded */

function WaitForLocalizationToLoad()
{

	/* Activate timer */

	localizationchecktimer=setInterval(CheckLocalizationLoaded,100);

};

/* Check if localization is loaded */

function CheckLocalizationLoaded()
{

	/* Check a string */

	if (mozL10n.get('hiking-guide-title')!='')
	{

		/* Stop timer */

		clearInterval(localizationchecktimer);

		/* Initialize the application */

		InitializeApplication();

	};

};

/* Application initialization */

function InitializeApplication()
{

	/* Create map */

	map=new OpenLayers.Map(
		{
			div: "map"
 		}
	);

	/* Create and add OpenStreetMap layer */

	osmlayer=new OpenLayers.Layer.OSM();
	map.addLayer(osmlayer);

	/* Create and add Google Maps layers (only when online) */

	if (navigator.onLine)
	{
		googlephysicallayer=new OpenLayers.Layer.Google(mozL10n.get('main-google-physical-layer-name'),{type: google.maps.MapTypeId.TERRAIN});
		map.addLayer(googlephysicallayer);

		googlestreetslayer=new OpenLayers.Layer.Google(mozL10n.get('main-google-streets-layer-name'),{numZoomLevels: 20});
		map.addLayer(googlestreetslayer);

		googlehybridlayer=new OpenLayers.Layer.Google(mozL10n.get('main-google-hybrid-layer-name'),{type: google.maps.MapTypeId.HYBRID, numZoomLevels: 20});
		map.addLayer(googlehybridlayer);

		googlesatellitelayer=new OpenLayers.Layer.Google(mozL10n.get('main-google-satellite-layer-name'),{type: google.maps.MapTypeId.SATELLITE, numZoomLevels: 22});
		map.addLayer(googlesatellitelayer);
	};

	/* Zoom map to whole world */

	map.zoomToMaxExtent();

	/* Create and add layer switcher control */

	layerswitchercontrol=new OpenLayers.Control.LayerSwitcher(
		{
			roundedCorner:true
		}
	);
	map.addControl(layerswitchercontrol);

	/* Create and add scale line control */

	scalelinecontrol=new OpenLayers.Control.ScaleLine();
	map.addControl(scalelinecontrol);

	/* Create and add track layer */

	tracklayer=new OpenLayers.Layer.Vector(
		mozL10n.get('main-track-layer-name'),
		{
			style: {
				strokeColor: "red",
				strokeWidth: 5,
				strokeOpacity: 0.5
			}
		}
	);
	map.addLayer(tracklayer);

	/* Create and add position layer */

	positionlayer=new OpenLayers.Layer.Vector(mozL10n.get('main-position-layer-name'));
	map.addLayer(positionlayer);

	/* Assign event to layers for enlarging layer switcher */

	for (layerind in map.layers)
	{
		map.layers[layerind].events.register(
			"visibilitychanged",
			tracklayer,
			function(evt)
			{
				EnlargeLayerSwitcher();
			}
		);
	};

	/* Create and add geolocation control */

	geolocate=new OpenLayers.Control.Geolocate(
		{
			bind: false,
			geolocationOptions:
			{
				enableHighAccuracy: false,
				maximumAge: 0,
				timeout: 7000
			}
		}
	);
	map.addControl(geolocate);
	firstgeolocation=true;
	geolocate.events.register(
		"locationupdated",
		geolocate,
		PositionUpdated
	);
	geolocate.events.register(
		"locationfailed",
		geolocate,
		PositionUpdateRestart
	);

	/* Add events to buttons */

	document.getElementById('locate').addEventListener('click',ManualPositionUpdate,false);
	document.getElementById('locateplaypause').addEventListener('click',PositionUpdatePlayPause,false);
	document.getElementById('waydelete').addEventListener('click',WayDelete,false);
	document.getElementById("menubutton").addEventListener('click',OpenSettings,false);
	document.getElementById("settingsokbutton").addEventListener('click',EndSettings,false);

	/* Define correct method for track file selection depending on system */

	if (enyo.platform.firefoxOS)
	{
		UpdateTrackFiles();
		document.getElementById('trackfileselect').addEventListener('change',NewTrackFileBySelect,false);
		document.getElementById('trackfileitem').parentNode.removeChild(document.getElementById('trackfileitem'));
	}
	else
	{
		document.getElementById('trackfile').addEventListener('change',NewTrackFileByInput,false);
		document.getElementById('trackfileselectitem').parentNode.removeChild(document.getElementById('trackfileselectitem'));
	};

	/* Puts OpenLayers' radio buttons and checkboxes inside label elements, so that they can be enlarged */

	EnlargeLayerSwitcher();

};
