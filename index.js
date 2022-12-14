const express = require('express')
const cors = require('cors')
const axios = require('axios')
const session = require('express-session')
const path = require('path')
const PORT = process.env.PORT || 5000
const { Pool } = require('pg');
const { query } = require('express')
const { resolve } = require('path')
const request = require('request-promise')
const cheerio = require('cheerio')
const {Client} = require("@googlemaps/google-maps-services-js");
const { isDataView } = require('util/types')
var pool;
const client = new Client({});
pool = new Pool({
  connectionString: process.env.DATABASE_URL, 
  ssl: {
      rejectUnauthorized: false
    }
})
var letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O',
'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z']
var app = express()
var isAdmin = 0;
var user;
var recentProf = []
var recentClass = []
var enrolled = []
var currentRadius;
var currentRestaurant = []
var flag = 0;
var resflag = 0;
app.use(session({
  name: 'session',
  secret: 'zordon',
  resave: false,
  saveUninitialized: false,
  maxAge: 30 * 60 * 1000  // 30 minutes
}))
app.use(express.json());
app.use(express.urlencoded({extended:false}))
app.use(express.static(path.join(__dirname, 'public')));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.get('/', (req, res) => {
  if(req.session.user)
  {
    res.redirect('/dashboard')
  }
  else
  {
    res.render('pages/index')
  }
})
const server = app.listen(PORT, () => console.log(`Listening on ${ PORT }`))

app.post('/', async (req,res)=> {
  var un = req.body.f_uname
  user = un
  var pwd = req.body.f_pwd
  const bool = await checkUsers(un, pwd)
  if(Number(bool) == 2 && isAdmin == 1)
  {
    req.session.user = req.body
    res.redirect('/admin')
  }
  else if(Number(bool) == 1)
  {
    req.session.user = req.body
    res.redirect('/dashboard')
  }
  else{
      res.redirect('/')
  }
})
app.get('/createaccount', (req, res)=>{
  res.render('pages/createaccount', {bool: false})
})
app.get('/logout', (req, res)=>{
  req.session.destroy();
  isAdmin = 0;
  res.redirect('/')
})
app.post('/createaccount', async (req, res)=>{
  var un = req.body.f_uname
  var pwd = req.body.f_pwd
  var fname = req.body.f_fname
  var lname = req.body.f_lname
 
  // test
  if(hasNumber(fname) == true || hasNumber(lname) == true)
  {
    var str = "Try again. Don't include numbers in first name or last name."
    // res.redirect('createaccount');

    //var incorrect = {'state': true};
    res.render('pages/createaccount', {bool: 1});
  }
  else
    {
    var queryString = `
    INSERT INTO usr (fname, lname, uname, fpassword)
    VALUES ('${fname}', '${lname}', '${un}', '${pwd}')
    `;
    const bool = await checkExistingUser(un)
    if(bool == 0)
    {
      pool.query(queryString, (error, response)=>{
        if(error)
        {
          res.send(error)
        }
        else
        {
          res.redirect('/')
        }
      })
    }
    else
    {
      var str = 'An account with this username already exists.'
      res.render('pages/createaccount', {bool: 2});
    }
  }
})
app.get('/admin', (req, res)=>{
  //user is an admin
  if(req.session.user && isAdmin == 1)
  {
    var getUsersQuery = `SELECT * FROM usr`;
    pool.query(getUsersQuery, (error, result)=>{
      var results = {'rows':result.rows}
      res.render('pages/admin', results)
    })
  }
  //user is logged in, but not an admin
  else if(req.session.user)
  {
    res.redirect('/dashboard')
  }
  //user is not logged in
  else
  {
    res.redirect('/')
  }
})
app.get('/dashboard', (req,res)=>{
  if (req.session.user)
  {
    var results = {'name': req.session.user.f_uname}
    res.render('pages/dashboard', results)
  }
  else
  {
    res.redirect('/')
  }
})

// GET SCHEDULE redirects to this
app.get('/schedule', async(req, res)=>{
  if (req.session.user)
  {
    var queryString = `SELECT * FROM classes where username='${user}'`;
    pool.query(queryString, (error, result)=>{
      if(error)
      {
        res.send(error)
      }
      var enroll = {'rows':result.rows}
      enrolled = enroll
      var results = recentProf
      var classes = recentClass
      res.render('pages/schedule', {results:results, classes:classes, enrolled:enrolled.rows, flag:flag})
      flag = 0;
    })
  }
  else
  {
    res.redirect('/')
  }
})

// ADD class
app.post('/enroll', async (req, res)=>{
  var username = user
  var course = req.body.fname.trim()
  var location = req.body.fcampus
  var prof = req.body.fprofessor
  var days = req.body.fdays
  var start = req.body.fstart
  var end = req.body.fend
  var queryString = `
  INSERT INTO classes (username, course, section, location, professor, days, startt, endt)
  VALUES ('${username}', '${course}', '${course}', '${location}', '${prof}', '${days}', '${start}', '${end}')
  `;
  var bool = await checkConflictingTime(start, end, days)
  if(bool == 1)
  {
    pool.query(queryString, (error, result)=>{
      if(error)
      {
        res.send(error)
        return 0;
      }
      recentClass = []
      flag = 0;
      res.redirect('/schedule')
      // res.render('pages/schedule', {flag: 0});
    })
  }
  else
  {
    flag = 2;
    res.redirect('/schedule')
    //res.render('pages/schedule', {flag: 2}); // Conflicting Time
  }
})

// DELETE Class
app.post('/delete', (req, res)=>{
  var course = req.body.fcourse
  course.trim()
  var queryString = `
  DELETE FROM classes
  WHERE course='${course}'`;
  pool.query(queryString, (error, result)=>{
    if(error)
    {
      res.send(error)
      return 0;
    }
    flag = 3;
    res.redirect('/schedule') // Removed class
  })
})

app.get('/groups',async (req,res)=>{
  if (req.session.user)
  {
    clubScrape(function(clubs){
      res.render('pages/groups', {clubs:clubs})
    })

  }
  else
  {
    res.redirect('/')
  }
})

// RMP 
app.post('/schedule', async (req, res)=>{
  var course = req.body.fcourse
  var firstName = req.body.fname
  var subj = req.body.subj
  if(firstName!=null && subj!=null)
  {
    var results = []
    await scrape(firstName, subj, results)
    recentProf = results
    flag = 0;
    res.redirect('/schedule')
    // res.render('pages/schedule', {flag: 0});
    return 0;
  }
  else if(course)
  {
    var classes = []
    await getCourseInformation(course, classes)
    if(classes.length>0)
    {
      recentClass = classes
      flag = 0;
      res.redirect('/schedule')
      // res.render('pages/schedule', {flag: 0});
      return 0;
    }
    else
    {
      flag = 0;
      res.redirect('/schedule')
      // res.render('pages/schedule', {flag: 0});
    }
  }
  else
  {
    flag = 1; // RMP BUTTON DOESNT WORK
    res.redirect('/schedule')
  }
})

app.get('/maps', async (req, res)=>{
  if(req.session.user)
  {
    var queryString = `SELECT * FROM rest where uname='${user}'`
    pool.query(queryString, (error, result)=>{
      if(error)
      {
        res.send(error)
      }
      else
      {
        res.render('pages/maps', {currentRestaurant:currentRestaurant, fav:result.rows, flag:resflag})
      }
    })
  }
  else
  {
    res.redirect('/dashboard')
  }
})
app.post('/maps', async (req, res)=>{
  var arr = [];
  var fradius = req.body.radius
  var button = req.body.btn
  var campus = req.body.campus
  currentRadius = fradius
  if(button == "Filter by: Price" && campus == "true")
  {
    await findLocalRestauraunts(arr, fradius, "Burnaby")
    currentRestaurant = arr;
    quickSortPrice(currentRestaurant, 0, currentRestaurant.length-1)
  }
  else if(button == "Filter by: Price" && campus == "false")
  {
    await findLocalRestauraunts(arr, fradius, "Surrey")
    currentRestaurant = arr;
    quickSortPrice(currentRestaurant, 0, currentRestaurant.length-1)
  }
  else if(button == "Filter by: Top Rated" && campus == "true")
  {
    await findLocalRestauraunts(arr, fradius, "Burnaby")
    currentRestaurant = arr;
    quickSortRating(currentRestaurant, 0, currentRestaurant.length-1)
  }
  else if(button == "Filter by: Top Rated" && campus == "false")
  {
    await findLocalRestauraunts(arr, fradius, "Surrey")
    currentRestaurant = arr;
    quickSortRating(currentRestaurant, 0, currentRestaurant.length-1)
  }
  resflag = 0;
  res.redirect('/maps')
})

app.post('/addrestaurant', async (req, res)=>{
  var name = req.body.fname
  var uname = user;
  var bool = await checkExistingRest(name)
  if(bool == 1)
  {
    //add error case for duplicate here
    // res.render('/maps',{flag:1})
    resflag = 1;
    res.redirect('/maps') // Already exists in fav pg bool 1
  }
  else
  {
    if(name.includes("'"))
    {
      var a = await name.split("'")
      var newStr = a[0] + "''" +a[1]
      name = newStr
    }
    var queryString = `
    INSERT INTO rest (uname, name)
    VALUES ('${uname}', '${name}')
    `;
    pool.query(queryString, (error, result)=>{
      if(error)
      {
        resflag = 2
        res.redirect('maps') // DB error
        // res.render('maps',{flag:2})
      }
      else
      {
        resflag = 0
        res.redirect('/maps')
      }
    })
  }
})
app.post('/removerestaurant', async (req, res)=>{
  var rest= req.body.rest
  if(rest.includes("'"))
  {
    var a = await rest.split("'")
    var newStr = a[0] + "''" +a[1]
    rest = newStr
  }
  var queryString = `DELETE FROM rest
  WHERE name='${rest}'`;
  pool.query(queryString, (error, result)=>{
    if(error)
    {
      // res.render('maps',{flag:2})
      resflag = 2
      res.redirect('/maps') // DB Error
    }
    else
    {
      resflag = 0
      res.redirect('/maps')
    }
  })
})

// GROUP PAGE SEARCH AND FILTER
app.post('/searchclub',async (req,res)=>{
  if(req.session.user)
  {
    var search = req.body.fsearch
    clubScrape(function(clubs){
      newClubs = []
      for(var i = 0; i < clubs.length;i++)
      {
        if(clubs[i].name.toLowerCase().includes(search.toLowerCase()))
        {
          newClubs.push(clubs[i]);
        }
      }
      res.render('pages/groups', {clubs:newClubs})
    })
  }
  else
  {
    res.redirect('/')
  }
})


app.post('/filter',async(req,res)=>{
  if(req.session.user)
  {
    var search = req.body.fletter
    clubScrape(function(clubs){
      newClubs = []
      for(var i = 0; i < clubs.length;i++)
      {
        if(clubs[i].name.toLowerCase().charAt(0) == search)
        {
          newClubs.push(clubs[i]);
        }
      }
      res.render('pages/groups', {clubs:newClubs})
    })
  }
  else
  {
    res.redirect('/')
  }
})
//Function to check if logged in users are registered in "usr" table.
//Returns 1 if there is
//returns 2 if the logged in user is an admin
//0 otherwise (err)
function checkUsers(name, password)
{
  //create a promise 
  return new Promise((resolve, reject)=>
  {
    if(name.trim() == 'admin' && password.trim() == 'admin')
    {
      isAdmin = 1;
      resolve(2);
    }
    var getUsersQuery = `SELECT * FROM usr`;
    setTimeout(() => {
      pool.query(getUsersQuery, (error, result)=>{
        if(error)
          resolve(0);
        var results = {'rows':result.rows}
        for(var i = 0; i<results.rows.length; i++)
        {
          var r1 = results['rows'][i]['uname'].toString()
          var r2 = results['rows'][i]['fpassword'].toString()
          if(r1.trim() == name.trim() && r2.trim() == password.trim())
          {
            resolve(1);
            return 1;
          }
        }
        resolve(0);
        return 0;
    }, 100)})
  })
}
//function to check duplicate users when registering
function checkExistingUser(name)
{
  //create a promise 
  return new Promise((resolve, reject)=>
  {
    var getUsersQuery = `SELECT * FROM usr`;
    setTimeout(() => {
      pool.query(getUsersQuery, (error, result)=>{
        if(error)
          resolve(0);
        var results = {'rows':result.rows}
        for(var i = 0; i<results.rows.length; i++)
        {
          var r1 = results['rows'][i]['uname'].toString()
          if(r1.trim() == name.trim())
          {
            resolve(1);
            return 1;
          }
        }
        resolve(0);
        return 0;
        
    }, 100)})
  })
}
function checkExistingRest(rest)
{
  return new Promise((resolve, reject)=>
  {
    var getUsersQuery = `SELECT * FROM rest`;
    setTimeout(async () =>{
      pool.query(getUsersQuery, (error, result)=>{
        if(error)
          resolve(0);
        var results = {'rows':result.rows}
        for(var i = 0; i<results.rows.length; i++)
        {
          var r1 = results['rows'][i]['name'].toString()
          if(r1.trim() == rest.toString().trim())
          {
            resolve(1);
            return 1;
          }
        }
        resolve(0);
        return 0;
    }, 100)})
  })
}
//returns sections from courses
//input: course (e.g., CMPT 120)
//output:
async function getCourseInformation(course, courseInfo)
{
  //split the input (course) into the course code and course numbers, e.g. input = CMPT 120 => courseLetters = 'cmpt' courseNumbers = '120'
  var formattedStr = course.trim()
  var index = formattedStr.search(/[0-9]/);
  const courseLetters = formattedStr.slice(0, index-1).toLowerCase();
  const courseNumbers = formattedStr.slice(index, formattedStr.length);
  var url = 'https://www.sfu.ca/bin/wcm/course-outlines?2022/fall/' + courseLetters + '/' + courseNumbers + '/'
  var valid = 0;
  try
  {
    var {data} = await axios.get(url)
  }
  catch
  {
    valid = 1
  }
  let i = 0;
  //variable to print the information of the course only once
  let hasRan = 0;
  if(valid == 0)
  {
    while(i<data.length)
    {
      const sectionurl = url + data[i]['value']
      try{
        const sectionData = await axios.get(sectionurl)
        if(hasRan == 0)
        {
          courseInfo.push({
            desc: sectionData['data']['info']['description'],
            prereq: sectionData['data']['info']['prerequisites'],
            notes: sectionData['data']['info']['notes']
          })
          // courseInfo.push(sectionData['data']['info']['description'], sectionData['data']['info']['prerequisites'], sectionData['data']['info']['notes'])
          hasRan = 1
        }
        if(sectionData['data']['courseSchedule'][0]["sectionCode"]=="LEC")
        { 
          try{
              courseInfo.push({
              name: sectionData['data']['info']['name'],
              term: sectionData['data']['info']['term'],
              prof: sectionData['data']['instructor'][0]['name'],
              campus: sectionData['data']['courseSchedule'][0]["campus"],
              room: sectionData['data']['courseSchedule'][0]["buildingCode"],
              roomNum: sectionData['data']['courseSchedule'][0]["roomNumber"],
              days: sectionData['data']['courseSchedule'][0]["days"] + ", " + sectionData['data']['courseSchedule'][1]["days"],
              start: sectionData['data']['courseSchedule'][0]["startTime"] + "," + sectionData['data']['courseSchedule'][1]["startTime"],
              end: sectionData['data']['courseSchedule'][0]["endTime"] + "," + sectionData['data']['courseSchedule'][1]["endTime"],
            })
          }
          catch(err)
          {
            courseInfo.push({
              name: sectionData['data']['info']['name'],
              term: sectionData['data']['info']['term'],
              prof: sectionData['data']['instructor'][0]['name'],
              campus: sectionData['data']['courseSchedule'][0]["campus"],
              room: sectionData['data']['courseSchedule'][0]["buildingCode"],
              roomNum: sectionData['data']['courseSchedule'][0]["roomNumber"],
              days: sectionData['data']['courseSchedule'][0]["days"],
              start: sectionData['data']['courseSchedule'][0]["startTime"],
              end: sectionData['data']['courseSchedule'][0]["endTime"]
            })
          }
          // arr.push(sectionData['data']['info']['name'], sectionData['data']['info']['term'], sectionData['data']['instructor'][0]['name'], sectionData['data']['courseSchedule'][0]["campus"],
          // sectionData['data']['courseSchedule'][0]["buildingCode"], sectionData['data']['courseSchedule'][0]["roomNumber"], sectionData['data']['courseSchedule'][0]["days"], sectionData['data']['courseSchedule'][0]["startTime"], sectionData['data']['courseSchedule'][0]["endTime"])
          // courseInfo.push(arr)
        }
        i++;
      }
      catch(err){
        i++;
      }
    }
  }
}
//webscrape api
//input: Professer First name, last name, and a subject they teach (e.g., CMPT)
//output: [firstname, lastname, averageRating, [class, rating, comment] x 3]]
async function scrape(name, subject, arr)
{
  if(name.length>0 && subject.length>0 && !hasNumber(name) && !hasNumber(subject) && name.includes(" "))
  {
    const nm = name.trim().split(/\s+/)
    for(let i = 0; i<letters.length; i++)
    {
      const url = 'https://ratemyprof-api.vercel.app/api/getProf?first=' + nm[0].toLowerCase() + '&last=' + nm[1].toLowerCase() + '&schoolCode=U2Nob29sLTE0Nj' + letters[i]
      const { data } = await axios.get(url);
      try
      {
        if(data['ratings'][i]['class'].includes(subject.toUpperCase()))
        {
          arr.push({
            fname: data['firstName'],
            lname: data['lastName'],
            r: data['avgRating']
          })
          arr.push({
            class: data['ratings'][0]['class'],
            rating: data['ratings'][0]['clarityRating'],
            comment: data['ratings'][0]['comment'],
            grade: data['ratings'][0]['grade']
          })
          arr.push({
            class: data['ratings'][1]['class'],
            rating: data['ratings'][1]['clarityRating'],
            comment: data['ratings'][1]['comment'],
            grade: data['ratings'][1]['grade']
          })
          arr.push({
            class: data['ratings'][2]['class'],
            rating: data['ratings'][2]['clarityRating'],
            comment: data['ratings'][2]['comment'],
            grade: data['ratings'][2]['grade']
          })
          {break;}
        }
      }
      catch(err){
      }
    }
  }
}

//webscraper for Clubs npm install cheerio, request-promise
async function clubScrape(callback)
{
  clubs = []
  request("https://go.sfss.ca/clubs/list", (error,response,html)=>{
  if(!error && response.statusCode ==200){
      const $= cheerio.load(html);
      $("b").each((i,data)=>{
            club = {name:"", desc:"", link:""};
            const name = $(data).text();
            const link = $(data).find('a').attr('href');
            club.name = name;
            club.link = link;
            if(name != '' && link != ''){
              clubs.push(club);
            }
      })

      $('b').remove();
      value = 0;
      $("td").each((num,data)=>{
          const desc = $(data).text().trim();
          if(desc != ''){
            clubs[value].desc = desc;
            value++;
          }
      })
      callback(clubs);
    }
  })
}

function checkChars(str)
{
  return /^[a-zA-Z]+$/.test(str)
}

function hasNumber(string)
{
  return /\d/.test(string)
}
//returns 1 if true, 0 if false
async function checkConflictingTime(startTime, endTime, days)
{
  return new Promise((resolve, reject)=>
  {
    var getUsersQuery = `SELECT * FROM classes where username='${user}'`;
    if(startTime.includes(","))
    {
      var time = convertTime(startTime, endTime)
      var day = days.trim().split(',')
      setTimeout(() => {
        pool.query(getUsersQuery, (error, result)=>{
          if(error)
          {
            resolve(0);
          }
          var results = {'rows':result.rows}
          for(var i = 0; i<results.rows.length; i++)
          {
            if(results['rows'][i]['startt'].includes(","))
            {
              let start = convertTime(results['rows'][i]['startt'], results['rows'][i]['endt'])
              let otherdays = results['rows'][i]['days']
              if(((time[0] >= start[0] && time[1] <=start[1]) || (time[0] <= start[0] && (time[1] >= start[0] && time[1] <= start[1])) || (time[1] >= start[1] && (time[0] >= start[0] && time[0] <=start[1])))
              || ((time[2] >= start[2] && time[3] <=start[3]) || (time[2] <= start[2] && (time[3] >= start[2] && time[3] <= start[2])) || (time[3] >= start[3] && (time[2] >= start[2] && time[2] <=start[3]))))
              {
                for(var j = 0; j<day.length; j++)
                {
                  if(otherdays.includes(day))
                  {
                    resolve(0);
                    return 0;
                  }
                }
              }
            }
            else
            {
              let start = convertTime(results['rows'][i]['startt'], results['rows'][i]['endt'])
              let otherdays = results['rows'][i]['days']
              if(((time[0] >= start[0] && time[1] <=start[1]) || (time[0] <= start[0] && (time[1] >= start[0] && time[1] <= start[1])) || (time[1] >= start[1] && (time[0] >= start[0] && time[0] <=start[1])))
              || (time[2] >= start[0] && time[3] <=start[1]) || (time[2] <= start[0] && (time[3] >= start[0] && time[3] <= start[1])) || (time[3] >= start[1] && (time[2] >= start[0] && time[2] <=start[1])))
              {
                for(var j = 0; j<day.length; j++)
                {
                  if(otherdays.includes(day))
                  {
                    resolve(0);
                    return 0;
                  }
                }
              }
            }
          }
          resolve(1);
          return 1;

        }, 100)})
    }
    else
    {
      var time = convertTime(startTime, endTime)
      var day = days.trim().split(',')
      setTimeout(() => {
        pool.query(getUsersQuery, (error, result)=>{
          if(error)
            resolve(0);
          var results = {'rows':result.rows}
          for(var i = 0; i<results.rows.length; i++)
          {
            
            if(results['rows'][i]['startt'].includes(","))
            {
              let start = convertTime(results['rows'][i]['startt'], results['rows'][i]['endt'])
              let otherdays = results['rows'][i]['days']
              if((time[0] >= start[0] && time[1] <=start[1]) || (time[0] <= start[0] && (time[1] >= start[0] && time[1] <= start[1])) || (time[1] >= start[1] && (time[0] >= start[0] && time[0] <=start[1]))
              || (time[0] >= start[2] && time[1] <=start[3]) || (time[0] <= start[2] && (time[1] >= start[2] && time[1] <= start[3])) || (time[1] >= start[3] && (time[0] >= start[2] && time[0] <=start[3])))
              {
                for(var j = 0; j<day.length; j++)
                {
                  if(otherdays.includes(day))
                  {
                    resolve(0);
                    return 0;
                  }
                }
              }
            }
            else
            {
              let start = convertTime(results['rows'][i]['startt'], results['rows'][i]['endt'])
              let otherdays = results['rows'][i]['days']
              if(((time[0] >= start[0] && time[1] <=start[1]) || (time[0] <= start[0] && (time[1] >= start[0] && time[1] <= start[1])) || (time[1] >= start[1] && (time[0] >= start[0] && time[0] <=start[1]))))
              {
                for(var j = 0; j<day.length; j++)
                {
                  if(otherdays.includes(day))
                  {
                    resolve(0);
                    return 0;
                  }
                }
              }
            }
          }
          resolve(1);
          return 1;
      }, 100)})
    }
  })
}
//returns [startTime, endTime] in minutes
function convertTime(startTime, endTime)
{
  if(startTime.includes(","))
  {
    let start = startTime.split(",")
    let end = endTime.split(",")
    let start1 = start[0].split(":")
    let start2 = start[1].split(":")
    let end1 = end[0].split(":")
    let end2 = end[1].split(":")
    var arr = []
    var s1minute = Number(start1[0])*60 + Number(start1[1])
    var s2minute = Number(start2[0])*60 + Number(start2[1])
    var e1minute = Number(end1[0])*60 + Number(end1[1])
    var e2minute = Number(end2[0])*60 + Number(end2[1])
    arr.push(s1minute, e1minute, s2minute, e2minute)
    return arr;
  }
  else
  {
    let start = startTime.split(":")
    let end = endTime.split(":")
    var arr = []
    var minute = Number(start[0])*60 + Number(start[1])
    var minute2 = Number(end[0])*60 + Number(end[1])
    arr.push(minute, minute2)
    return arr;
  }
}

async function findLocalRestauraunts(arr, radius, campus)
{
  var url;
  if(campus == "Burnaby")
  {
    url = 'https://maps.googleapis.com/maps/api/place/textsearch/json?query=restaurants&location=49.2781,-122.9199&radius=' + radius + '&key=AIzaSyA_BT-GrVANBYP-iZo_dmM6kYx6pEkQ3Bk'
  }
  else if(campus == "Surrey")
  {
    url = 'https://maps.googleapis.com/maps/api/place/textsearch/json?query=restaurants&location=49.1880,-122.8494&radius=' + radius + '&key=AIzaSyA_BT-GrVANBYP-iZo_dmM6kYx6pEkQ3Bk'
  }
  await axios.get(url)
  .then(async (response)=>{
    var data;
    data = response.data
    for(let i = 0; i<data["results"].length; i++)
    {
      const revurl = 'https://maps.googleapis.com/maps/api/place/details/json?place_id=' + data['results'][i]['place_id'] + '&key=AIzaSyA_BT-GrVANBYP-iZo_dmM6kYx6pEkQ3Bk'
      await axios.get(revurl)
      .then((resp)=>{
        var reviews = resp.data
        if(data["results"][i]["price_level"] === undefined)
        {
          arr.push({
            address: data["results"][i]["formatted_address"],
            name: data["results"][i]["name"],
            rating: data["results"][i]["rating"],
            num: data["results"][i]["user_ratings_total"],
            lat: data["results"][i]["geometry"]["location"]["lat"],
            lng: data["results"][i]["geometry"]["location"]["lng"],
            price: 1,
            hours: reviews["result"]["opening_hours"]["weekday_text"],
            review: reviews["result"]['reviews'][0]
          })
        }
        else
        {
          arr.push({
            address: data["results"][i]["formatted_address"],
            name: data["results"][i]["name"],
            rating: data["results"][i]["rating"],
            num: data["results"][i]["user_ratings_total"],
            lat: data["results"][i]["geometry"]["location"]["lat"],
            lng: data["results"][i]["geometry"]["location"]["lng"],
            price: data["results"][i]["price_level"],
            hours: reviews["result"]["opening_hours"]["weekday_text"],
            review: reviews["result"]['reviews'][0]
          })
        }
      })
    }
  })
  return url;
}
// https://stackabuse.com/quicksort-in-javascript/
async function swap(items, leftIndex, rightIndex){
    var temp = items[leftIndex];
    items[leftIndex] = items[rightIndex];
    items[rightIndex] = temp;
}
async function partitionRating(items, left, right) {
    var pivot   = items[Math.floor((right + left) / 2)]['rating'], //middle element
        i       = left, //left pointer
        j       = right; //right pointer
    while (i <= j) {
        while (items[i]['rating'] < pivot) {
            i++;
        }
        while (items[j]['rating'] > pivot) {
            j--;
        }
        if (i <= j) {
            await swap(items, i, j); //sawpping two elements
            i++;
            j--;
        }
    }
    return i;
}
async function partitionPrice(items, left, right) {
  var pivot   = items[Math.floor((right + left) / 2)]['price'], //middle element
      i       = left, //left pointer
      j       = right; //right pointer
  while (i <= j) {
      while (items[i]['price'] < pivot) {
          i++;
      }
      while (items[j]['price'] > pivot) {
          j--;
      }
      if (i <= j) {
          await swap(items, i, j); //sawpping two elements
          i++;
          j--;
      }
  }
  return i;
}
async function quickSortRating(items, left, right) {
    var index;
    if (items.length > 1) {
        index = await partitionRating(items, left, right); //index returned from partition
        if (left < index - 1) { //more elements on the left side of the pivot
            await quickSortRating(items, left, index - 1);
        }
        if (index < right) { //more elements on the right side of the pivot
            await quickSortRating(items, index, right);
        }
    }
    return items;
}
async function quickSortPrice(items, left, right) {
  var index;
  if (items.length > 1) {
      index = await partitionPrice(items, left, right); //index returned from partition
      if (left < index - 1) { //more elements on the left side of the pivot
          await quickSortPrice(items, left, index - 1);
      }
      if (index < right) { //more elements on the right side of the pivot
          await quickSortPrice(items, index, right);
      }
  }
  return items;
}
const method = async () => {
  var arr = [];
  const token = await findLocalRestauraunts(arr, 400, "Burnaby")
  return token
}
const qsRating = async () =>{
  var arr = []
  arr.push({
    address: "random st",
    name: "one",
    rating: 1,
    num: 2,
    lat: 49.31,
    lng: 49.29,
    price: 1,
    hours: "N/A",
    review: "N/A"
  })
  arr.push({
    address: "random st",
    name: "two",
    rating: 2,
    num: 2,
    lat: 49.31,
    lng: 49.29,
    price: 2,
    hours: "N/A",
    review: "N/A"
  })
  arr.push({
    address: "random st",
    name: "three",
    rating: 3,
    num: 2,
    lat: 49.31,
    lng: 49.29,
    price: 3,
    hours: "N/A",
    review: "N/A"
  })
  const token = await quickSortPrice(arr, 0, 2)
  return token;
}
const cs = async() =>{
  clubScrape(function(clubs){
    newClubs = []
    var search = 'Finance'
    for(var i = 0; i < clubs.length;i++)
    {
      if(clubs[i].name.toLowerCase().includes(search.toLowerCase()))
      {
        newClubs.push(clubs[i]);
      }
    }
  })
  return newClubs;
}
const cs1 = async() =>{
    clubScrape(function(clubs){
      newClubs = []
      var search = 'A'
      for(var i = 0; i < clubs.length;i++)
      {
        if(clubs[i].name.toLowerCase().charAt(0) == search)
        {
          newClubs.push(clubs[i]);
        }
      }
      return newClubs
    })
}
const qsPrice = async () =>{
  var arr = []
  arr.push({
    address: "random st",
    name: "one",
    rating: 1,
    num: 2,
    lat: 49.31,
    lng: 49.29,
    price: 1,
    hours: "N/A",
    review: "N/A"
  })
  arr.push({
    address: "random st",
    name: "two",
    rating: 2,
    num: 2,
    lat: 49.31,
    lng: 49.29,
    price: 100,
    hours: "N/A",
    review: "N/A"
  })
  arr.push({
    address: "random st",
    name: "three",
    rating: 3,
    num: 2,
    lat: 49.31,
    lng: 49.29,
    price: 10,
    hours: "N/A",
    review: "N/A"
  })
  const token = await quickSortPrice(arr, 0, 2)
  return token;
}
module.exports = {
  app,
  method,
  qsRating,
  qsPrice,
  cs,
  cs1
};

// module.exports = {
//   findLocalRestauraunts, partitionPrice, partitionRating, swap, quickSortPrice, quickSortRating
// }