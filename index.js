// Import required modules
const express = require('express');
const session = require("express-session");
const passport = require('passport');
const parser = require('body-parser');
const { Pool } = require('pg');
const dotenv = require('dotenv').config();

// Load authentication configuration
require('./auth')

// Middleware function to check if user is logged in
function isLoggedIn(req, res, next) {
    // Check if user is authenticated
    req.user ? next() : res.sendStatus(401); // Send 401 Unauthorized status if not
}

// Create express app
const app = express();
const port = 3000;

// Add session middleware
app.use(session({ secret: 'cats'}));
app.use('/images', express.static('images'));

// Add passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Route to start Google OAuth2 authentication
app.get('/auth/google', 
    passport.authenticate('google', { scope: ['email', 'profile'] })
);

// Route called by Google OAuth2 callback after successful authentication
app.get('/google/callback',
    passport.authenticate('google', {
        successRedirect: '/verification', // Redirect to /protected on successful authentication
        failureRedirect: '/auth/failure', // Redirect to /auth/failure on authentication failure
    })
);

// Route to display error message when authentication fails
app.get('auth/failure', (req, res) => {
    res.send('something went wrong..');
});

// Route to display protected content, only accessible if user is authenticated
app.get('/verification', isLoggedIn, (req, res) => {
    res.render('verification.ejs');
});

// Create pool
const pool = new Pool({
    user: process.env.PSQL_MASTER_USER,
    host: process.env.PSQL_HOST,
    database: process.env.PSQL_DATABASE,
    password: process.env.PSQL_MASTER_PASSWORD,
    port: process.env.PSQL_PORT,
    ssl: {rejectUnauthorized: false}
});

const poolWill = new Pool({
    user: process.env.PSQL_WILL_USER,
    host: process.env.PSQL_HOST,
    database: process.env.PSQL_DATABASE,
    password: process.env.PSQL_WILL_PASSWORD,
    port: process.env.PSQL_PORT,
    ssl: {rejectUnauthorized: false}
});

// Add process hook to shutdown pool
process.on('SIGINT', function() {
    pool.end();
    console.log('Application successfully shutdown');
    process.exit(0);
});

app.use(parser.urlencoded({ extended: false }));
app.use(parser.json());
app.set("view engine", "ejs");

app.get('/', (req, res) => {
    res.render('index');
});

app.get('/test', (req, res) => {
    res.render('test');
});

app.get('/checkout', (req, res) => {
    res.render('checkout');
});

// Manual Logins
app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/user', function (req, res) {
    const items = req.body.itemName;
    const prices = req.body.itemPrice;
    const ids = req.body.itemIds;
    const quantities = req.body.itemQuantity;
    const toppings = req.body.itemToppings;

    const calculateTotal = () => {
        let total = 0;
        for (let i = 0; i < prices.length; i++) {
          total += prices[i] * quantities[i];
        }
        return total;
      };
    
      const total = calculateTotal();
    
      res.render('checkout', { ids, items, prices, quantities, toppings, total });
});

app.post('/checkout', function (req, res) {
    const name = req.body.name
    const payment = req.body.payment
    const toppings = req.body.toppings
    const total = req.body.total
    const itemQuantities = JSON.parse(req.body.itemQuantities)
    const now = new Date();
    const isoDate = now.toISOString();
    const year = isoDate.substring(0, 4);
    const month = isoDate.substring(5, 8);
    const day = isoDate.substring(8, 10);

    const date = year + '-' + month + '-' + day;

    const itemNames = [];
    for (let i = 0; i < toppings.length; i++) {
        if(toppings[i] != ''){
            const toppingsArr = toppings[i].split(', ');
            for (let j = 0; j < toppingsArr.length; j++) {
                itemNames.push(toppingsArr[j]);
            }
        }
    }
    
    let promises = [];
    let itemId = [];

    for (let i = 0; i < itemNames.length; i++) {
        const itemName = itemNames[i];
        const queryOne = {
            text: 'SELECT ingredient_id FROM ingredients WHERE ingredient_name = $1',
            values: [itemName],
        };
        let promise = pool.query(queryOne)
            .then(result => {
                const ingredientId = result.rows[0].ingredient_id;
                itemId.push(ingredientId);
            })
            .catch(err => {
                console.error(err);
                res.status(500).send('Database error');
                return;
            });
        promises.push(promise);
    }

    Promise.all(promises)
        .then(() => {
            console.log(itemId);
            const menuItems = [];
        for (const id in itemQuantities) {
            const quantity = parseInt(itemQuantities[id]);
            for (let i = 0; i < quantity; i++) {
                menuItems.push(parseInt(id));
            }
        }
    
    const queryTwo = {
        text: 'INSERT INTO orderhistory (customer_name, date, amount_paid, items, payment_type, processed, menu_items) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        values: [name, date, total, itemId, payment, false, menuItems],
    };
    poolWill.query(queryTwo, function (err, result) {
        if (err) {
            console.error(err);
            res.status(500).send('Database error');
            return;
        }

        for(let i = 0; i<itemNames.length; i++)
        {
            const queryThree = {
                text: 'UPDATE inventory SET quantity_available = quantity_available - amount_used_per_order WHERE inventory_item_name = $1',
                values: [itemNames[i]],
            };
            pool.query(queryThree, function(err, result) {
                if (err) {
                    console.error(err);
                    res.status(500).send('Database error');
                    return;
                }
            });
        }
        
        res.render('index');
        
        
    });
      
        })
        .catch(err => {
            console.error(err);
            res.status(500).send('Database error');
            return;
        });



        /*
    // for(let i = 0; i<itemId.length; i++)
    // {
    //     console.log("Ingredient ID")
    //     console.log(itemId);
    // }

    const menuItems = [];
    for (const id in itemQuantities) {
        const quantity = parseInt(itemQuantities[id]);
        for (let i = 0; i < quantity; i++) {
            menuItems.push(parseInt(id));
        }
    }
    
    items = [] //int array

    /*
    const sql = 'INSERT INTO orderhistory (customer_name, date, amount_paid, items, payment_type, processed, menu_items) VALUES (?, ?, ?, ?, ?, ?, ?)'
    const values = [name, date, total, items, payment, false, menuItems];
    pool.query(sql, function (err, result) {
        if (err) {
            console.error(err);
            res.status(500).send('Database error');
            return;
        }
    }); */ 
});

app.post('/index', function (req, res) {
    const email = req.body.email;
    const password = req.body.password;

    if (!email || !password) {
        res.status(400).send('Email and password required');
        return;
    }

    const sql = 'SELECT * FROM employeelogins WHERE email = $1';
    pool.query(sql, [email], function (err, result) {
        if (err) {
            res.status(500).send('Database error');
            return;
        }

        if (result.rows.length == 0) {
            res.status(401).send('Invalid email or password');
            return;
        }

        const user = result.rows[0];
        if (password !== user.password) {
            res.status(401).send('Invalid email or password');
            return;
        }
        if(user.man_privileges == true ) {
            res.redirect('/managerScreen');
        } else {
            res.redirect('/orderPage');
        }
    });
});

app.post('/verification', function (req, res) {
    const password = req.body.password;

    if (!password) {
        res.status(400).send('Password required');
        return;
    }

    const sql = 'SELECT * FROM employeelogins WHERE man_privileges = true';
    pool.query(sql, function (err, result) {
        if (err) {
            res.status(500).send('Database error');
            return;
        }

        if (result.rows.length == 0) {
            res.status(401).send('No managers found');
            return;
        }

        const managers = result.rows;
        const manager = managers.find(m => m.password === password);
        if (!manager) {
            res.send({ success: false });
        }
        else {
            res.send({ success: true });
        }
    });
});

app.get('/managerScreen', (req, res) => {
    res.render('managerScreen');
});

app.get('/serverLogin', (req, res) => {
    res.render('serverLogin');
});

app.get('/orderPage', (req, res) => {
    res.render('orderPage');
});

app.get('/checkout', (req, res) => {
    res.render('checkout');
});

app.get('/inventoryPage', (req, res) => {
    inventory = []
    pool
    .query('SELECT * FROM inventory ORDER BY inventory_item_id ASC;')
    .then(query_res => {
        for (let i = 0; i < query_res.rowCount; i++){
            inventory.push(query_res.rows[i]);
        }
        const data = {inventory: inventory};
        //console.log(inventory);
        //res.render('user', data);
        res.render('inventoryPage',{inventory})
    });
});

app.post('/inventoryPage',function(req,res){

    const enterItemName = req.body.additemName;
    const enterCurrentStock = req.body.addcurrentStock;
    const enterPerUse = req.body.addperamount;
    const enterPerUnit = req.body.addUnitCost;
    const enterMinimum = req.body.addMinimum;
    enterDrink = 'no';
    enterIngredient = 'no' 

    const updateId = req.body.updateid;
    const updateName = req.body.updateitemName;
    const updateStock = req.body.updatecurrentStock;
    const updatePerUse = req.body.updateperamount;
    const updateCost = req.body.updatepercost;
    const updateMinimum = req.body.updateMinimum;

    const deleteName = req.body.deleteitem;

    if (req.body.drinkCheck1 === 'drink') 
    {
        console.log('Drink checkbox checked');
        enterDrink = 'yes';

    } 
    else if (req.body.foodCheck1 === 'ingredient') 
    {
        console.log('Ingredient checkbox checked');
        enterIngredient = 'yes';
    }
    
    if(!enterItemName && !enterCurrentStock && !enterPerUse && !enterPerUnit && !enterMinimum && !updateId && !updateName && !updateStock && !updatePerUse && !updateCost && !updateMinimum && !deleteName)
    {
        res.redirect('errorPage');
        return;
    }
    else if(!updateId && !updateName && !updateStock && !updatePerUse && !updateCost && !updateMinimum && !deleteName)
    {
        if(!enterItemName || !enterCurrentStock || !enterPerUse || !enterPerUnit && !enterMinimum)
        {
            res.redirect('errorPage');
            return;
        }

        console.log("User wants to enter new inventory");

        const query = {
            text: 'INSERT INTO inventory(inventory_item_name, quantity_available, amount_used_per_order, per_unit_cost, ingredient, drink, minimum) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            values: [enterItemName, enterCurrentStock,enterPerUse,enterPerUnit, enterIngredient,enterDrink,enterMinimum],
          };

          pool.query(query, (err, res) => {
            if (err) {
              console.log(err.stack);
            } else {
              console.log('Data inserted successfully');
            }
          });
        
        if(enterIngredient == 'yes')
        {
            const query = {
                text: 'INSERT INTO ingredients (ingredient_name) VALUES ($1)',
                values: [enterItemName],
              };
    
              pool.query(query, (err, res) => {
                if (err) {
                  console.log(err.stack);
                } else {
                  console.log('Data inserted successfully');
                }
              });
        }

        if(enterDrink == 'yes')
        {
            const query = {
                text: 'INSERT INTO menu (item_name, item_price) VALUES ($1,$2)',
                values: [enterItemName,enterPerUnit],
              };
    
              pool.query(query, (err, res) => {
                if (err) {
                  console.log(err.stack);
                } else {
                  console.log('Data inserted successfully');
                }
              });
        }
    }
    else if(!enterItemName && !enterCurrentStock && !enterPerUse && !enterPerUnit && !enterMinimum && !deleteName)
    {
        currentName = '';
        ingredient = '';
        drink = '';
        if(!updateId || !updateName || !updateStock || !updatePerUse || !updateCost || !updateMinimum)
        {
            console.log("Error");
            console.log(updateId);
            console.log(updateName);
            console.log(updateStock);
            console.log(updatePerUse);
            console.log(updateCost);
            console.log(updateMinimum);
            res.redirect('errorPage');
            return;
        } 
        console.log("User wants to update inventory");

        const queryOne = {
            text: 'SELECT inventory_item_name, ingredient, drink FROM inventory WHERE inventory_item_id = $1',
            values: [updateId],
        };

        pool.query(queryOne, (err, res) => {
            if (err) {
              console.log(err.stack);
            } else {
                const row = res.rows[0];
                currentName = row.inventory_item_name;
                ingredient = row.ingredient;
                drink = row.drink;
                
                //pool.query is asynch function so much use currentName ingredient and drink variables in this else block
                if(drink == 'yes')
                {
                    console.log("Entered drink");
                    console.log(updateName);
                    const query = {
                        text: 'UPDATE menu SET item_name = $1 WHERE item_name = $2',
                        values: [updateName, currentName],
                    };

                    pool.query(query, (err, res) => {
                        if (err) {
                            console.log(err.stack);
                        } else {
                            console.log('Data drink updated successfully');
                        }
                    });
                }

                if (ingredient == 'yes') {
                    console.log("Entered ingredient");
                    const query = {
                        text: 'UPDATE ingredients SET ingredient_name = $1 WHERE ingredient_name = $2',
                        values: [updateName, currentName],
                    };

                    pool.query(query, (err, res) => {
                        if (err) {
                            console.log(err.stack);
                        } else {
                            console.log('Data ingredient updated successfully');
                        }
                    });
                }
            }
          });

        const query = {
            text: 'UPDATE inventory SET inventory_item_name = $1, quantity_available = $2, amount_used_per_order = $3, per_unit_cost = $4, minimum = $5 WHERE inventory_item_id = $6',
            values: [updateName,updateStock,updatePerUse,updateCost,updateMinimum,updateId],
          };

          pool.query(query, (err, res) => {
            if (err) {
              console.log(err.stack);
            } else {
              console.log('Data inventory updated successfully');
            }
          }); 

    }
    else if(!enterItemName && !enterCurrentStock && !enterPerUse && !enterPerUnit && !enterMinimum && !updateId && !updateName && !updateStock && !updatePerUse && !updateCost && !updateMinimum)
    {
        if(!deleteName)
        {
            res.redirect('errorPage');
            return;
        }

        console.log("User wants to delete item");

        const queryOne = {
            text: 'DELETE from Inventory  WHERE inventory_item_name= $1',
            values: [deleteName],
          };

          pool.query(queryOne, (err, res) => {
            if (err) {
              console.log(err.stack);
            } else {
              console.log('Data inventory deleted successfully');
            }
          }); 

          const queryTwo = {
            text: 'DELETE from Ingredients WHERE ingredient_name = $1',
            values: [deleteName],
          };

          pool.query(queryTwo, (err, res) => {
            if (err) {
              console.log(err.stack);
            } else {
              console.log('Data ingredient deleted successfully');
            }
          });

          const queryThree = {
            text: 'DELETE from menu WHERE item_name= $1',
            values: [deleteName],
          };

          pool.query(queryThree, (err, res) => {
            if (err) {
              console.log(err.stack);
            } else {
              console.log('Data ingredient deleted successfully');
            }
          });
    }
    res.redirect('inventoryPage'); 
});

app.get('/enterInventory', (req, res) => {
    res.redirect('inventoryPage');
});

app.get('/updateInventory', (req, res) => {
    res.redirect('inventoryPage');
});

app.get('/deleteInventory', (req, res) => {
    res.redirect('inventoryPage');
});

app.get('/enterItem', (req, res) => {
    res.redirect('menuPage');
});

app.get('/updateItem', (req, res) => {
    res.redirect('menuPage');
});

app.get('/deleteItem', (req, res) => {
    res.redirect('menuPage');
});

app.get('/trendsPage', (req, res) => {
    res.render('trendsPage');
});

app.get('/menuPage', (req, res) => {
    menu = []
    pool
    .query('SELECT * FROM menu ORDER BY item_id ASC;')
    .then(query_res => {
        for (let i = 0; i < query_res.rowCount; i++){
            menu.push(query_res.rows[i]);
        }
        const data = {menu: menu};
        //console.log(menu);
        //res.render('user', data);
        res.render('menuPage',{menu})
    });
});

app.get('/ingredients', (req, res) => {
    ingredients = []
    pool
    .query('SELECT * FROM ingredients ORDER BY ingredient_id ASC;')
    .then(query_res => {
        for (let i = 0; i < query_res.rowCount; i++){
            ingredients.push(query_res.rows[i]);
        }
        const data = {ingredients: ingredients};
        //console.log(menu);
        //res.render('user', data);
        res.render('ingredients',{ingredients})
    });
});

app.post('/menuPage',function(req,res){
    const enterItemName = req.body.addmenuitemName;
    const enterPrice = req.body.addmenuPrice;

    const updateMenuId = req.body.menuid;
    const updateMenuName = req.body.updatemenuitemName;
    const updateMenuPrice = req.body.updatemenuPrice;

    const deleteMenuId = req.body.deletemenuitem;

    if(!enterPrice && !enterItemName && !updateMenuId && !updateMenuName && !updateMenuPrice && !deleteMenuId)
    {
        res.redirect('errorPage');
        return;
    }
    else if(!updateMenuId && !updateMenuName && !updateMenuPrice && !deleteMenuId)
    {
        if(!enterItemName || !enterPrice)
        {
            res.redirect('errorPage');
            return;
        }

        console.log("User wants to enter new item");

        const query = {
            text: 'INSERT INTO menu (item_name, item_price) VALUES ($1, $2)',
            values: [enterItemName, enterPrice],
          };

          pool.query(query, (err, res) => {
            if (err) {
              console.log(err.stack);
            } else {
              console.log('Data inserted successfully');
            }
          });
    }
    else if(!enterItemName && !enterPrice && !deleteMenuId)
    {
        if(!updateMenuId || !updateMenuName || !updateMenuPrice)
        {
            res.redirect('errorPage');
            return;
        }
        console.log("User wants to update");

        const query = {
            text: 'UPDATE menu SET item_name = $1, item_price = $2 WHERE item_id = $3',
            values: [updateMenuName, updateMenuPrice,updateMenuId],
          };

          pool.query(query, (err, res) => {
            if (err) {
              console.log(err.stack);
            } else {
              console.log('Data inserted successfully');
            }
          });
    }
    else if(!enterItemName && !enterPrice && !updateMenuId && !updateMenuName && !updateMenuPrice)
    {
        console.log("User wants to delete");

        const query = {
            text: 'DELETE FROM menu WHERE item_id = $1',
            values: [deleteMenuId],
          };

          pool.query(query, (err, res) => {
            if (err) {
              console.log(err.stack);
            } else {
              console.log('Data deleted successfully');
            }
          });
    }
    
    //console.log(enterItemName);
    //console.log(enterPrice);

    //console.log(updateMenuId);
    //console.log(updateMenuName);
    //console.log(updateMenuPrice);

    //console.log(deleteMenuId);

    res.redirect('menuPage'); 
});

app.get('/orderConfirmation', (req, res) => {
    res.render('orderConfirmation');
});

app.get('/salesReport', (req, res) => {
    res.render('salesReport');
});

app.post('/salesReport', function (req, res) {
    const startDate = req.body.salesstart;
    const endDate = req.body.salesend;
    const itemName = req.body.salesid;
  
    if (!itemName || !startDate || !endDate) {
        res.status(400).send('Item name, start date, and end date are required.');
        return;
      }

    // Your database query goes here
    const query = `SELECT * FROM orderhistory WHERE date BETWEEN '${startDate}' AND '${endDate}' AND ${itemName} = ANY(items);`;
    
    // Run the query using your database driver (e.g. PostgreSQL)
    // and obtain the results as an array of objects
    pool.query(query, function (err, result) {
        if (err) {
            console.error(err);
            res.status(500).send('Database error');
            return;
        }
        
      const columnNames = ['order_id', 'customer_name', 'date', 'amount_paid', 'items', 'payment_type'];
      const tableData = result.rows;
    
      // Render the salesReport page with the query results
      res.render('salesReport', {columnNames, tableData});
    });
  });
  

app.get('/xReport', (req, res) => {
    res.render('xReport');
});

app.post('/xReport', function (req,res) {
    const date = req.body.xreportstart;

  if (!date) {
    res.status(400).send('Date required');
    return;
  }

  const query = `SELECT m.item_name, CAST(SUM(m.item_price) AS NUMERIC(10,2)) AS total_sales 
                 FROM orderhistory o 
                 JOIN menu m ON m.item_id = ANY(o.menu_items) 
                 WHERE o.processed = false AND o.date >= '${date}' 
                 GROUP BY m.item_name`;

  pool.query(query, function (err, result) {
    if (err) {
      console.error(err);
      res.status(500).send('Database error');
      return;
    }

    const columnNames = ['item_name', 'total_sales'];
    const tableData = result.rows;
    const totalSales = tableData.reduce((acc, row) => acc + Number(row.total_sales), 0);

    res.render('xReport', { columnNames, tableData, totalSales });
  });
});

app.post('/zReport', function (req, res) {
    const date = req.body.zreportstart;

    if (!date) {
        res.status(400).send('Date required');
        return;
    }

    const query = `SELECT m.item_name, CAST(SUM(m.item_price) AS NUMERIC(10,2)) AS total_sales 
                    FROM orderhistory o 
                    JOIN menu m ON m.item_id = ANY(o.menu_items) 
                    WHERE o.date >= '${date}' 
                    GROUP BY m.item_name`;

    pool.query(query, function (err, result) {
        if (err) {
            console.error(err);
            res.status(500).send('Database error');
            return;
        }

        const columnNames = ['item_name', 'total_sales'];
        const tableData = result.rows;
        const totalSales = tableData.reduce((acc, row) => acc + Number(row.total_sales), 0);

        // Append a new row with the total sales to the end of the table data
        // tableData.push({ 'Item Name': 'Total Sales', 'Total Sales': totalSales });

        // Update the processed field in the database
        const updateQuery = `UPDATE orderhistory SET processed = true WHERE date >= '${date}'`;
        pool.query(updateQuery, function (err, result) {
            if (err) {
                console.error(err);
                res.status(500).send('Database error');
                return;
            }

            res.render('zReport', {columnNames, tableData, totalSales });
        });
    });
});

app.get('/errorPage', (req, res) => {
    res.render('errorPage');
});

app.get('/zReport', (req, res) => {
    res.render('zReport');
});

app.get('/excessReport', (req, res) => {
    
    res.render('excessReport');
});

app.post('/excessReport', function (req, res) {
    const date = req.body.excessstart;
    const queryText = 'SELECT * FROM orderhistory WHERE date >= $1';
    const queryParams = [date];
    
    const itemIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
         22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43,
          44, 45, 46, 47, 48, 49];
    const itemCounts = Object.fromEntries(itemIds.map(id => [id, 0]));

    const itemQuantities = {}; // initialize object to hold the quantities for each item
    const inventoryQuery = 'SELECT inventory_item_id, quantity_available FROM inventory';

    const percentSold = {}; // initialize object to hold the percentages sold for each item

    pool.query(inventoryQuery, (error, result) => {
        if (error) {
          console.error(error);
          return;
        }
        // loop through each row of the result and add the quantity to the itemQuantities object
        result.rows.forEach((inventoryItem) => {
          itemQuantities[inventoryItem.inventory_item_id] = inventoryItem.quantity_available;
        });
    
        // This code depends on itemQuantities, so moved it inside the callback function
        pool.query(queryText, queryParams, (error, result) => {
            if (error) {
                console.error(error);
                return;
            }
            // loop through each order
            result.rows.forEach((order) => {
                // loop through each item in the order's items array
                order.items.forEach((item) => {
                    const itemId = item;
                    if (itemId in itemCounts) {
                        // increment the count for this item ID
                        itemCounts[itemId]++;
                    }
                });
            });
    
            for (const itemId in itemCounts) {
                const quantitySold = itemCounts[itemId];
                const quantityAvailable = itemQuantities[itemId];
                const percent = quantitySold / (quantityAvailable) * 100.0;
                percentSold[itemId] = percent;
            }

            // Create an array of item IDs where the percentage sold is less than 10%
            const lowInventoryItemIds = [];
            for (const itemId in percentSold) {
                if (percentSold[itemId] < 10) {
                    lowInventoryItemIds.push(itemId);
                }
            }

            // Use the array to build a parameterized query
            const lowInventoryQuery = `SELECT * FROM inventory WHERE inventory_item_id IN (${lowInventoryItemIds.map((id, index) => `$${index + 1}`).join(',')})`;
            const lowInventoryParams = lowInventoryItemIds;
            
            pool.query(lowInventoryQuery, lowInventoryParams, (error, result) => {
                if (error) {
                    console.error(error);
                    return;
                }

                const columnNames = ['inventory_item_id', 'inventory_item_name', 'quantity_available', 'amount_used_per_order', 'per_unit_cost', 'ingredient', 'drink', 'minimum'];
                const tableData = result.rows;
                // console.log("Low inventory items: ");
                // console.log(result.rows);
                
                res.render('excessReport', {columnNames, tableData});
            });
        });
    });
});



app.get('/index', (req, res) => {
    res.render('index');
});

app.get('/customize', (req, res) => {
  res.render('customize');
});


app.get('/orderhistoryPage', (req, res) => {
    orderHistory = []
    pool
    .query('SELECT * FROM orderhistory ORDER BY order_id DESC LIMIT 3000;')
    .then(query_res => {
        for (let i = 0; i < query_res.rowCount; i++){
            orderHistory.push(query_res.rows[i]);
        }
        const data = {orderHistory: orderHistory};
        //console.log(orderHistory);
        res.render('orderhistoryPage',{orderHistory})
    });
});


app.get('/user', (req, res) => {
    let menu = []
  let ingredients = []

  pool.query('SELECT * FROM menu ORDER BY item_id ASC;')
  .then(menu_query_res => {
    for (let i = 0; i < menu_query_res.rowCount; i++){
        menu.push(menu_query_res.rows[i]);
    }
    return pool.query('SELECT * FROM ingredients ORDER BY ingredient_id ASC;')
  })
  .then(ingredients_query_res => {
    for (let i = 0; i < ingredients_query_res.rowCount; i++){
        ingredients.push(ingredients_query_res.rows[i]);
    }
    const data = {menu: menu, ingredients: ingredients};
    res.render('user', data);
  });
    module.exports = { menu };
}); 

app.get('/restockReport', (req, res) => {
    inventory = []
    pool
    .query('SELECT inventory_item_id, inventory_item_name, quantity_available, minimum FROM inventory WHERE quantity_available < minimum;')
    .then(query_res => {
        for (let i = 0; i < query_res.rowCount; i++){
            inventory.push(query_res.rows[i]);
        }
        const data = {inventory: inventory};
        console.log(inventory);
        //res.render('user', data);
        res.render('restockReport',{inventory})
    });
}); 

app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`);
});
