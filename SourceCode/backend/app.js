var createError = require("http-errors");
var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");

var app = express();

app.use(express.static(path.join(__dirname, "dist/frontend")));
//app.use(express.static(process.cwd() + "/dist/frontend/"));

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

const axios = require("axios");
var geohash = require("ngeohash");
var SpotifyWebApi = require("spotify-web-api-node");

const TM_KEY = "iUCnFZteCxuVg9jMcUEm4PbRP71bs2CG";
const GOOGLE_KEY = "AIzaSyD7_F9j5-rn7OP57XdiTXdLdGm1GeqhXl0";

const SPOTIFY_CLIENT_ID = "02be7dbf811f4727ad8cf983bd150c07";
const SPOTIFY_CLIENT_SECRET = "cd1bc0f147a44e328684e20566308ab9";

// view engine setup
//app.set("views", path.join(__dirname, "views"));
//app.set("view engine", "jade");

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
//app.use(express.static(path.join(__dirname, "public")));

const getDateTime = () => {
  const now = Date.now();
  const dateObj = new Date(now);
  const year = dateObj.getFullYear();
  const month = dateObj.getMonth() + 1;
  const day = dateObj.getDate();
  const hours = dateObj.getHours();
  const minutes = dateObj.getMinutes();
  const seconds = dateObj.getSeconds();
  const readableDate = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  return readableDate;
};

let accessTokenCache = null;
let accessTokenCacheExpiry = 3600;

var spotifyApi = new SpotifyWebApi({
  clientId: SPOTIFY_CLIENT_ID,
  clientSecret: SPOTIFY_CLIENT_SECRET,
});

const getAccessToken = async () => {
  if (accessTokenCache === null || Date.now() >= accessTokenCacheExpiry) {
    console.log("Obtaining a new Access token at " + getDateTime());
    await spotifyApi
      .clientCredentialsGrant()
      .then(function (data) {
        accessTokenCache = data.body["access_token"];
        accessTokenCacheExpiry = Date.now() + data.body["expires_in"] * 1000;
        return accessTokenCache;
      })
      .catch(function (err) {
        console.log(
          "Something went wrong when retrieving an access token",
          err
        );
        throw err; // re-throw the error to be caught by the try/catch block in the calling function
      });
  } else {
    console.log("Exisiting access token returned");
  }
  return accessTokenCache;
};

app.get("/api/autocomplete", (req, res) => {
  const keyword = req.query.keyword;
  const url = `https://app.ticketmaster.com/discovery/v2/suggest?apikey=${TM_KEY}&keyword=${keyword}`;

  axios
    .get(url)
    .then((response) => {
      const data = response.data;
      const attractions = data._embedded?.attractions ?? [];
      const names = attractions.map((attraction) => attraction.name);
      res.send(names);
    })
    .catch((error) => {
      console.error(error);
      res.status(500).send("Error fetching data from API");
    });
});

const getSegmentId = (category) => {
  var segment_id = null;
  if (category == "Music") {
    segment_id = "KZFzniwnSyZfZ7v7nJ";
  } else if (category == "Sports") {
    segment_id = "KZFzniwnSyZfZ7v7nE";
  } else if (category == "Arts & Theatre") {
    segment_id = "KZFzniwnSyZfZ7v7na";
  } else if (category == "Film") {
    segment_id = "KZFzniwnSyZfZ7v7nn";
  } else if (category == "Miscellaneous") {
    segment_id = "KZFzniwnSyZfZ7v7n1";
  }
  return segment_id;
};

const getLatLongFromPlace = async (location) => {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${location}&key=${GOOGLE_KEY}`;
  try {
    const response = await axios.get(url);
    return response.data.results[0].geometry.location;
  } catch (error) {
    throw new Error("Error fetching data from API", error);
  }
};

app.get("/api/venues/:keyword", async (req, res) => {
  try {
    const keyword = req.params.keyword;
    const url = `https://app.ticketmaster.com/discovery/v2/venues?apikey=${TM_KEY}&keyword=${keyword}`;
    console.log(url);
    const response = await axios.get(url);
    res.send(response.data);
  } catch (error) {
    res.status(500).json({ message: "Error fetching venue details." });
  }
});

app.get("/api/events", async (req, res) => {
  const params = req.query;
  const keyword = params.keyword;
  const distance = params.distance;
  const segmentId = getSegmentId(params.category);
  var lat = null;
  var lng = null;

  if (params.coordinates) {
    lat = params.coordinates.split(",")[0];
    lng = params.coordinates.split(",")[1];
  } else {
    try {
      const location = await getLatLongFromPlace(params.location);
      lat = location.lat;
      lng = location.lng;
    } catch (error) {
      console.log("The location submitted by user is invalid or non existent");
      return res.send(
        "The location submitted by user is invalid or non existent"
      );
    }
  }
  const geocode = geohash.encode(lat, lng, 7);

  var url = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${TM_KEY}&keyword=${keyword}&radius=${distance}&unit=miles&geoPoint=${geocode}`;
  if (segmentId) {
    url += `&segmentId=${segmentId}&sort=date,asc`;
  }
  else {
    url += '&sort=date,asc';
  }
  const response = await axios.get(url);
  res.send(response.data);
});

app.get("/api/events/:id", async (req, res) => {
  try {
    const eventId = req.params.id;
    const url = `https://app.ticketmaster.com/discovery/v2/events/${eventId}?apikey=${TM_KEY}`;
    console.log(url);
    const response = await axios.get(url);
    res.send(response.data);
  } catch (error) {
    res.status(500).json({ message: "Error fetching event details." });
  }
});

app.get("/api/search-artists/:keyword", async (req, res) => {
  try {
    const keyword = req.params.keyword;
    const accessToken = await getAccessToken();
    spotifyApi.setAccessToken(accessToken);
    spotifyApi.searchArtists(keyword).then(
      function (data) {
        console.log(`Search artists by ${keyword}`, data.body);
        res.send(data.body);
      },
      function (err) {
        res.status(500).json({ message: "Error searching for artists." });
        console.error(err);
      }
    );
  } catch (error) {
    res.status(500).json({ message: "Error searching for artists." });
  }
});

app.get("/api/albums/:artistID", async (req, res) => {
  try {
    const artistID = req.params.artistID;
    const accessToken = await getAccessToken();
    spotifyApi.setAccessToken(accessToken);

    spotifyApi.getArtistAlbums(artistID, { limit: 3 }, function (err, data) {
      if (err) {
        console.error("Something went wrong!");
      } else {
        res.send(data.body);
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Error searching for artists." });
  }
});

// app.get("/*", (req, res) => {
//   console.log('here in the last app.get()')
//   console.log(path.join(__dirname, "dist/frontend/index.html"));
//   res.sendFile(path.join(__dirname, "dist/frontend/index.html"));
// });

app.use((req, res) => {
  console.log("here in the last app.get()");
  console.log(path.join(__dirname, "dist/frontend/index.html"));
  res.sendFile(path.join(__dirname, "dist/frontend/index.html"));
});

// app.get("/", (req, res) => {
//   res.send("Backend is running");
// });

// app.use("/", indexRouter);
// app.use("/users", usersRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render("error");
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

module.exports = app;
