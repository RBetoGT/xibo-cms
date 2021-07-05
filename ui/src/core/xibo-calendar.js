/*
 * Copyright (C) 2020 Xibo Signage Ltd
 *
 * Xibo - Digital Signage - http://www.xibo.org.uk
 *
 * This file is part of Xibo.
 *
 * Xibo is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * any later version.
 *
 * Xibo is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Xibo.  If not, see <http://www.gnu.org/licenses/>.
 */

// Global calendar object
var calendar;
var events = [];
var mymap;
var mymapmarker;

$(document).ready(function() {

    var getJsonRequestControl = null;

    // Set a listener for popover clicks
    //  http://stackoverflow.com/questions/11703093/how-to-dismiss-a-twitter-bootstrap-popover-by-clicking-outside
    $('body').on('click', function (e) {
        $('[data-toggle="popover"]').each(function () {
            //the 'is' for buttons that trigger popups
            //the 'has' for icons within a button that triggers a popup
            if (!$(this).is(e.target) && $(this).has(e.target).length === 0 && $('.popover').has(e.target).length === 0) {
                $(this).popover('hide');
            }
        });
    });
	
    // Set up the navigational controls
    $('.btn-group button[data-calendar-nav]').each(function() {
        var $this = $(this);
        $this.click(function() {
            calendar.navigate($this.data('calendar-nav'));
        });
    });

    $('.btn-group button[data-calendar-view]').each(function() {
        var $this = $(this);
        $this.click(function() {
            calendar.view($this.data('calendar-view'));
        });
    });

    // Calendar is initialised without any event_source (that is changed when the selector is used)
    if (($('#Calendar').length > 0)) {
        // Get some options for the calendar
        var calendarOptions = $("#CalendarContainer").data();

        // Callback function to navigate to calendar date with the date picker
        var navigateToCalendarDate = function() {
            if(calendar != undefined) {
                // Add event to the picker to update the calendar
                calendar.navigate('date', moment($('#dateInput input[data-input]').val()));
            }
        };

        // Select picker options
        var pickerOptions = {};

        if( calendarType == 'Jalali') {
            pickerOptions = {
                autoClose: true,
                altField: '#dateInputLink',
                altFieldFormatter: function(unixTime) {
                    var newDate = moment.unix(unixTime / 1000);
                    newDate.set('hour', 0);
                    newDate.set('minute', 0);
                    newDate.set('second', 0);
                    return newDate.format(jsDateFormat);
                },
                onSelect: function() {},
                onHide: function() {
                    // Trigger change after close
                    $('#dateInput').trigger('change');
                    $('#dateInputLink').trigger('change');
                }
            };
        } else if( calendarType == 'Gregorian') {
            pickerOptions = {
                wrap: true,
                altFormat: jsDateOnlyFormat
            };
        }

        // Create the date input shortcut
        initDatePicker(
            $('#dateInput'), 
            systemDateFormat, 
            jsDateOnlyFormat, 
            pickerOptions, 
            navigateToCalendarDate,
            false // clear button
        );

        // Location filter init
        var $map = $('.cal-event-location-map #geoFilterAgendaMap');

        // Get location button
        $('#getLocation').off().click(function() {
            var $self = $(this);

            // Disable button
            $self.prop('disabled', true);

            navigator.geolocation.getCurrentPosition(function(location) { // success
                // Populate location fields
                $('#geoLatitude').val(location.coords.latitude).change();
                $('#geoLongitude').val(location.coords.longitude).change();

                // Reenable button
                $self.prop('disabled', false);

                // Redraw map
                generateFilterGeoMap();
            }, function error(err) { // error
                console.warn('ERROR(' + err.code + '): ' + err.message);

                // Reenable button
                $self.prop('disabled', false);
            }, { // options
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            });
        });

        // Location map button
        $('#toggleMap').off().click(function() {
            $map.toggleClass('d-none');

            if(!$map.hasClass('d-none')) {
                generateFilterGeoMap();
            }
        });

        // Clear location button
        $('#clearLocation').off().click(function() {
            // Populate location fields
            $('#geoLatitude').val('').change();
            $('#geoLongitude').val('').change();

            if(!$map.hasClass('d-none')) {
                generateFilterGeoMap();
            }
        });

        // Change events reloads the calendar view and map
        $('#geoLatitude, #geoLongitude').off().change(_.debounce(function() {
            calendar.view();
        }, 400));
        
        // Calendar options
        var options = {
            time_start: '00:00',
            time_end: '00:00',
            events_source: function () { return events; },
            view: 'month',
            tmpl_path: function (name) {
                return 'calendar-template-' + name;
            },
            tmpl_cache: true,
            onBeforeEventsLoad: function (done) {

                var calendarOptions = $("#CalendarContainer").data();               

                // Append display groups and layouts
                var isShowAll = $('#showAll').is(':checked');

                // Enable or disable the display list according to whether show all is selected
                // we do this before we serialise because serialising a disabled list gives nothing
                $('#DisplayList').prop('disabled', isShowAll);

                if (this.options.view !== 'agenda') {

                    $('.cal-event-agenda-filter').hide();

                    // Serialise
                    var displayGroups = $('#DisplayList').serialize();
                    var displayLayouts = $('#campaignId').serialize();

                    var url = calendarOptions.eventSource;

                    // Append the Layout selected
                    url += '?' + displayLayouts;

                    // Should we append displays?
                    if (isShowAll) {
                        // Ignore the display list
                        url += '&' + 'displayGroupIds[]=-1';
                    } else if (displayGroups !== '') {
                        // Append display list
                        url += '&' + displayGroups;
                    }

                    events = [];
                    
                    // Populate the events array via AJAX
                    var params = {
                        "from": moment(this.options.position.start.getTime()).format(systemDateFormat),
                        "to": moment(this.options.position.end.getTime()).format(systemDateFormat)
                    };

                    // If there is already a request, abort it
                    if(getJsonRequestControl) {
                        getJsonRequestControl.abort();
                    }

                    $('#calendar-progress').addClass('show');

                    getJsonRequestControl = $.getJSON(url, params)
                        .done(function(data) {
                            events = data.result;

                            if (done != undefined)
                                done();

                            calendar._render();
                            
                            // Hook up any pop-overs (for small events)
                            $('[data-toggle="popover"]').popover({
                                trigger: "manual",
                                html: true,
                                placement: "bottom",
                                content: function() {
                                    return $(this).html();
                                }
                            }).on("mouseenter", function() {
                                var self = this;

                                // Hide all other popover
                                $('[data-toggle="popover"]').not(this).popover("hide");

                                // Show this popover
                                $(this).popover("show");

                                // Hide popover when mouse leaves it
                                $(".popover").off("mouseleave").on("mouseleave", function() {
                                    $(self).popover('hide');
                                });
                            }).on('shown.bs.popover', function() {
                                var source = $(this);
                                var popover = source.attr("aria-describedby");

                                $("#" + popover + " a").click(function(e) {
                                    e.preventDefault();
                                    XiboFormRender($(this));
                                    source.popover("hide");
                                });
                            });

                            $('#calendar-progress').removeClass('show');
                        })
                        .fail(function(res) {
                            $('#calendar-progress').removeClass('show');

                            if (done != undefined)
                                done();
                            
                            calendar._render();

                            if(res.statusText != 'abort') {
                                toastr.error(translations.failure);
                                console.error(res);
                            }
                        });
                } else {

                    // Show time slider on agenda view and call the calendar view on slide stop event
                    $('.cal-event-agenda-filter').show();

                    var $timePicker = $('#timePicker');

                    var momentNow = moment().tz ? moment().tz(timezone) : moment();

                    $timePicker.slider({
                        value: (momentNow.hour() * 60) + momentNow.minute(),
                        tooltip: 'always',
                        formatter: function(value) {
                            return moment().startOf("day").minute(value).format(jsTimeFormat);
                        }
                    }).off('slideStop').on('slideStop', function(ev) {
                        calendar.view();
                    });

                    $('.time-picker-step-btn').off().on('click', function() {
                        $timePicker.slider('setValue', $timePicker.slider('getValue') + $(this).data('step'));
                        calendar.view();
                    });

                    // Get selected display groups
                    var selectedDisplayGroup = $('.cal-context').data().selectedTab;
                    var displayGroupsList = [];
                    var chooseAllDisplays = false;

                    if(!isShowAll) {

                        $('#DisplayList').prop('disabled', false);

                        // Find selected display group and create a display group list used to create tabs
                        $('#DisplayList option').each(function() {
                            var $self = $(this);
                            
                            // If the all option is selected 
                            if ($self.val() == -1 && $self.is(':selected')) {
                                chooseAllDisplays = true;
                                return true;
                            }
                                
                            if($self.is(':selected') || chooseAllDisplays) {

                                displayGroupsList.push({
                                    id: $self.val(),
                                    name: $self.html(),
                                    isDisplaySpecific: $self.attr('type')
                                });

                                if (typeof selectedDisplayGroup == 'undefined') {
                                    selectedDisplayGroup = $self.val();
                                }
                            }
                        });
                    }
                    
                    // Sort display group list by name
                    displayGroupsList.sort(function(a, b){
                        var nameA = a.name.toLowerCase(), nameB=b.name.toLowerCase()
                        if (nameA < nameB) //sort string ascending
                            return -1;
                        if (nameA > nameB)
                            return 1;
                            
                        return 0; //default return value (no sorting)
                    });
                        
                    var url = calendarOptions.agendaLink.replace(":id", selectedDisplayGroup);
                                    
                    var dateMoment = moment(this.options.position.start.getTime() / 1000, "X");
                    var timeFromSlider = ( $('#timePickerSlider').length ) ? $('#timePicker').slider('getValue') : 0;
                    var timeMoment = moment(timeFromSlider*60, "X");

                    // Add hour to date to get the selected date
                    var dateSelected = moment(dateMoment + timeMoment);

                    // Populate the events array via AJAX
                    var params = {
                        "date": dateSelected.format(systemDateFormat)
                    };
                    
                    // if the result are empty create a empty object and reset the results
                    if(jQuery.isEmptyObject(events['results'])){
                        
                        // events var must be an array for compatibility with the previous implementation
                        events = [];
                        events['results'] = {}; 
                    }
                    
                    // Save displaygroup list and the selected display
                    events['displayGroupList'] = displayGroupsList;
                    events['selectedDisplayGroup'] = selectedDisplayGroup; 
                    
                    // Clean error message
                    events['errorMessage'] = '';
                    
                    // Clean cache/results if its requested by the options
                    if (calendar.options['clearCache'] == true) {
                        events['results'] = {}; 
                    }
                    
                    // If there is already a request, abort it
                    if(getJsonRequestControl) {
                        getJsonRequestControl.abort();
                    }

                    // 0 - If all is selected, force the user to specify the displaygroups
                    if(isShowAll) {
                        events['errorMessage'] = 'all_displays_selected';

                        if(done != undefined)
                            done();

                        calendar._render();
                    } else if($('#DisplayList').val() == null || Array.isArray($('#DisplayList').val()) && $('#DisplayList').val().length == 0) {
                        // 1 - if there are no displaygroups selected
                        events['errorMessage'] = 'display_not_selected';
                        
                        if (done != undefined)
                            done();
                            
                        calendar._render();
                    } else if(!jQuery.isEmptyObject(events['results'][selectedDisplayGroup]) && events['results'][selectedDisplayGroup]['request_date'] == params.date && events['results'][selectedDisplayGroup]['geoLatitude'] == $('#geoLatitude').val() && events['results'][selectedDisplayGroup]['geoLongitude'] == $('#geoLongitude').val()) {
                        // 2 - Use cache if the element was already saved for the requested date
                        if (done != undefined)
                            done();
                            
                        calendar._render();
                    } else {

                        $('#calendar-progress').addClass('show');

                        // 3 - make request to get the data for the events
                        getJsonRequestControl = $.getJSON(url, params)
                            .done(function(data) {

                                var noEvents = true;

                                if(!jQuery.isEmptyObject(data.data) && data.data.events != undefined && data.data.events.length > 0){
                                    events['results'][String(selectedDisplayGroup)] = data.data;
                                    events['results'][String(selectedDisplayGroup)]['request_date'] = params.date;

                                    noEvents = false;

                                    if($('#geoLatitude').val() != undefined && $('#geoLatitude').val() != '' &&
                                        $('#geoLongitude').val() != undefined && $('#geoLongitude').val() != '') {
                                        events['results'][String(selectedDisplayGroup)]['geoLatitude'] = $('#geoLatitude').val();
                                        events['results'][String(selectedDisplayGroup)]['geoLongitude'] = $('#geoLongitude').val();

                                        events['results'][String(selectedDisplayGroup)]['events'] = filterEventsByLocation(events['results'][String(selectedDisplayGroup)]['events']);

                                        noEvents = (data.data.events.length <= 0);
                                    }
                                }

                                if(noEvents) {
                                    events['results'][String(selectedDisplayGroup)] = {};
                                    events['errorMessage'] = 'no_events';
                                }
                                
                                if (done != undefined)
                                    done();
                                    
                                calendar._render();

                                $('#calendar-progress').removeClass('show');
                            })
                            .fail(function(res) {
                                // Deal with the failed request

                                if (done != undefined)
                                    done();
                                
                                if(res.statusText != 'abort') {
                                    events['errorMessage'] = 'request_failed';
                                }
                                
                                calendar._render();
                                
                                $('#calendar-progress').removeClass('show');
                            });
                    }
                        
                }
                
            },
            onAfterEventsLoad: function(events) {
                if(this.options.view == 'agenda') {
                    // When agenda panel is ready, turn tables into datatables with paging
                    $('.agenda-panel').ready(function() {
                        $('.agenda-table-layouts').dataTable({
                            "searching": false
                        });
                    });
                }

                if(!events) {
                    return;
                }
            },
            onAfterViewLoad: function(view) {                
                // Sync the date of the date picker to the current calendar date
                if (this.options.position.start != undefined && this.options.position.start != "") {
                    // Update timepicker
                    updateDatePicker($('#dateInput'), moment.unix(this.options.position.start.getTime() / 1000).format(jsDateOnlyFormat), jsDateOnlyFormat);
                }
                
                if (typeof this.getTitle === "function")
                    $('h1.page-header').text(this.getTitle());

                $('.btn-group button').removeClass('active');
                $('button[data-calendar-view="' + view + '"]').addClass('active');
            },
            language: calendarLanguage
        };

        options.type = calendarOptions.calendarType;
        calendar = $('#Calendar').calendar(options);
        
        // Set event when clicking on a tab, to refresh the view
        $('.cal-context').on('click', 'a[data-toggle="tab"]', function (e) {
            $('.cal-context').data().selectedTab = $(this).data("id");
            calendar.view();
        });
        
        // When selecting a layout row, create a Breadcrumb Trail and select the correspondent Display Group(s) and the Campaign(s)
        $('.cal-context').on('click', 'tbody tr', function (e) {
            var $self = $(this);
            var alreadySelected = $self.hasClass('selected');
            
            // Clean all selected elements
            $('.cal-event-breadcrumb-trail').hide();
            $('.cal-context tbody tr').removeClass('selected');
            $('.cal-context tbody tr').removeClass('selected-linked');
            
            // If the element was already selected return so that it can deselect everything 
            if (alreadySelected)
                return;
            
            // If the click was in a layout table row create the breadcrumb trail
            if ($self.closest('table').data('type') == 'layouts'){
                $('.cal-event-breadcrumb-trail').show();
                
                // Clean div content
                $('.cal-event-breadcrumb-trail #content').html('');

                // Get the template and render it on the div
                $('.cal-event-breadcrumb-trail #content').append(calendar._breadcrumbTrail($self.data("elemId"), events, $self.data("eventId")));
                
                // Create mini layout preview
                createMiniLayoutPreview(layoutPreviewUrl.replace(':id', $self.data("elemId")));

                XiboInitialise("");
            }
            
            // Select the clicked element and the linked elements
            agendaSelectLinkedElements($self.closest('table').data('type'), $self.data("elemId"), events, $self.data("eventId"));
        });
    }
});

/**
 * Callback for the schedule form
 */
var setupScheduleForm = function(dialog) {
    console.log("Setup schedule form");

    // geo schedule
    var $geoAware = $('#isGeoAware');
    var isGeoAware = $geoAware.is(':checked');

    if (isGeoAware) {

        // without this additional check the map will not load correctly, it should be initialised when we are on the Geo Location tab
        $('.nav-tabs a').on('shown.bs.tab', function(event){
            if ($(event.target).text() === 'Geo Location') {

                $('#geoScheduleMap').removeClass('d-none');
                generateGeoMap();
            }
        });
    }

    // hide/show and generate map according to the Geo Schedule checkbox value
    $geoAware.change(function() {
        isGeoAware = $('#isGeoAware').is(':checked');

        if (isGeoAware) {
            $('#geoScheduleMap').removeClass('d-none');
            generateGeoMap();
        } else {
            $('#geoScheduleMap').addClass('d-none');
        }
    });

    // Share of voice
    var shareOfVoice = $("#shareOfVoice");
    var shareOfVoicePercentage = $("#shareOfVoicePercentage");
    shareOfVoice.on("change paste keyup", function() {
        convertShareOfVoice(shareOfVoice.val());
    });

    shareOfVoicePercentage.on("change paste keyup", function() {
        var percentage = shareOfVoicePercentage.val();
        var conversion;
        conversion = Math.round((3600 * percentage) / 100);
        shareOfVoice.val(conversion);
    });


    var convertShareOfVoice = function(seconds) {
        var conversion;
        conversion = (100 * seconds) / 3600;
        shareOfVoicePercentage.val(conversion.toFixed(2));
    };

    convertShareOfVoice(shareOfVoice.val());

    setupSelectForSchedule(dialog);

    $('select[name="recurrenceRepeatsOn[]"]', dialog).select2({
        width: "100%"
    });
    
    // Hide/Show form elements according to the selected options
    // Initial state of the components
    processScheduleFormElements($("#recurrenceType", dialog));
    processScheduleFormElements($("#eventTypeId", dialog));
    processScheduleFormElements($("#campaignId", dialog));

    // Events on change
    $("#recurrenceType, #eventTypeId, #dayPartId, #campaignId", dialog).on("change", function() { processScheduleFormElements($(this)) });

    // Handle the repeating monthly selector
    // Run when the tab changes
    $('a[data-toggle="tab"]', dialog).on('shown.bs.tab', function (e) {
        var nth = function(n) {
          return n + (["st","nd","rd"][((n+90)%100-10)%10-1] || "th")
        };
        var $fromDt = $(dialog).find("input[name=fromDt]");
        var fromDt = ($fromDt.val() === null || $fromDt.val() === "") ? moment() : moment($fromDt.val());
        var $recurrenceMonthlyRepeatsOn = $(dialog).find("select[name=recurrenceMonthlyRepeatsOn]");
        var $dayOption = $('<option value="0">' + $recurrenceMonthlyRepeatsOn.data("transDay").replace("[DAY]", fromDt.format("Do")) + '</option>');
        var $weekdayOption = $('<option value="1">' + $recurrenceMonthlyRepeatsOn.data("transWeekday").replace("[POSITION]", nth(Math.ceil(fromDt.date() / 7))).replace("[WEEKDAY]", fromDt.format("dddd")) + '</option>');

        $recurrenceMonthlyRepeatsOn.find("option").remove().end().append($dayOption).append($weekdayOption).val($recurrenceMonthlyRepeatsOn.data("value"));
    });

    // Bind to the dialog submit
    $("#scheduleAddForm, #scheduleEditForm, #scheduleDeleteForm, #scheduleRecurrenceDeleteForm").submit(function(e) {
        e.preventDefault();

        var form = $(this);

        $.ajax({
            type: $(this).attr("method"),
            url: $(this).attr("action"),
            data: $(this).serialize(),
            cache: false,
            dataType: "json",
            success: function(xhr, textStatus, error) {

                XiboSubmitResponse(xhr, form);

                if (xhr.success) {
                    // Reload the Calendar
                    calendar.options['clearCache'] = true;
                    calendar.view();
                }
            }
        });
    });

    // Popover
    $(dialog).find('[data-toggle="popover"]').popover();

    // Post processing on the schedule-edit form.
    var $scheduleEditForm = $(dialog).find("#scheduleEditForm");
    if ($scheduleEditForm.length > 0) {
        // Add a button for duplicating this event
        var $button = $("<button>").addClass("btn btn-info")
            .attr("id", "scheduleDuplateButton")
            .html(translations.duplicate)
            .on("click", function() {
                duplicateScheduledEvent();
            });

        $(dialog).find('.modal-footer').prepend($button);

        // Update the date/times for this event in the correct format.
        $scheduleEditForm.find("#instanceStartDate").html(moment($scheduleEditForm.data().eventStart, "X").format(jsDateFormat));
        $scheduleEditForm.find("#instanceEndDate").html(moment($scheduleEditForm.data().eventEnd, "X").format(jsDateFormat));

        // Add a button for deleting single recurring event
        $button = $("<button>").addClass("btn btn-primary")
            .attr("id", "scheduleRecurringDeleteButton")
            .html(translations.deleteRecurring)
            .on("click", function() {
                deleteRecurringScheduledEvent(
                    $scheduleEditForm.data('eventId'),
                    $scheduleEditForm.data('eventStart'),
                    $scheduleEditForm.data('eventEnd')
                );
            });

        $(dialog).find('#recurringInfo').prepend($button);
    }

    configReminderFields($(dialog));

};

var deleteRecurringScheduledEvent = function(id, eventStart, eventEnd) {
    var url = scheduleRecurrenceDeleteUrl.replace(":id", id);
    var data = {
        eventStart: eventStart,
        eventEnd: eventEnd,
    };
    XiboSwapDialog(url, data);
}

var beforeSubmitScheduleForm = function(form) {

    var checkboxes = form.find('[name="reminder_isEmail[]"]');

    checkboxes.each(function (index) {
        $(this).parent().find('[type="hidden"]').val($(this).is(":checked") ? "1" : "0");
    });

    $('[data-toggle="popover"]').popover();

    form.submit();

};

/**
 * Configure the query builder ( order and filter )
 * @param {object} dialog - Dialog object
 */
 var configReminderFields = function(dialog) {

    var reminderFields = dialog.find("#reminderFields");

    if(reminderFields.length == 0)
        return;

    var reminderEventTemplate = Handlebars.compile($("#reminderEventTemplate").html());

    //console.log(reminderFields.data().reminders.length);
    if(reminderFields.data().reminders.length == 0) {
        // Add a template row
        var context = {
            title: 0,
            buttonGlyph: "fa-plus"
        };
        reminderFields.append(reminderEventTemplate(context));
    } else {
        // For each of the existing codes, create form components
        var i = 0;
        $.each(reminderFields.data().reminders, function(index, field) {
            i++;

            var context = {
                scheduleReminderId: field.scheduleReminderId,
                value: field.value,
                type: field.type,
                option: field.option,
                isEmail: field.isEmail,
                title: i,
                buttonGlyph: ((i == 1) ? "fa-plus" : "fa-minus")
            };

            reminderFields.append(reminderEventTemplate(context));
        });
    }

    // Nabble the resulting buttons
    reminderFields.on("click", "button", function(e) {
        e.preventDefault();

        // find the gylph
        if($(this).find("i").hasClass("fa-plus")) {
            var context = {title: reminderFields.find('.form-group').length + 1, buttonGlyph: "fa-minus"};
            reminderFields.append(reminderEventTemplate(context));
        } else {
            // Remove this row
            $(this).closest(".form-group").remove();
        }
    });
};

/**
 * Process schedule form elements for the purpose of showing/hiding them
 * @param el jQuery element
 */
var processScheduleFormElements = function(el) {
    var fieldVal = el.val();
    
    switch (el.attr('id')) {
        case 'recurrenceType':
            //console.log('Process: recurrenceType, val = ' + fieldVal);

            var repeatControlGroupDisplay = (fieldVal == "") ? "none" : "";
            var repeatControlGroupWeekDisplay = (fieldVal != "Week") ? "none" : "";
            var repeatControlGroupMonthDisplay = (fieldVal !== "Month") ? "none" : "";

            $(".repeat-control-group").css('display', repeatControlGroupDisplay);
            $(".repeat-weekly-control-group").css('display', repeatControlGroupWeekDisplay);
            $(".repeat-monthly-control-group").css('display', repeatControlGroupMonthDisplay);
            $('#recurrenceDetail').parent().find('.input-group-addon').html(el.val());

            break;
        
        case 'eventTypeId':
            console.log('Process: eventTypeId, val = ' + fieldVal);
            
            var layoutControlDisplay = (fieldVal == 2) ? "none" : "";
            var endTimeControlDisplay = (fieldVal == 2) ? "none" : "";
            var startTimeControlDisplay = (fieldVal == 2) ? "" : "";
            var dayPartControlDisplay = (fieldVal == 2) ? "none" : "";
            var commandControlDisplay = (fieldVal == 2) ? "" : "none";
            var scheduleSyncControlDisplay = (fieldVal == 1) ? "" : "none";
            var interruptControlDisplay = (fieldVal == 4) ? "" : "none";


            $(".layout-control").css('display', layoutControlDisplay);
            $(".endtime-control").css('display', endTimeControlDisplay);
            $(".starttime-control").css('display', startTimeControlDisplay);
            $(".day-part-control").css('display', dayPartControlDisplay);
            $(".command-control").css('display', commandControlDisplay);
            $(".sync-schedule-control").css('display', scheduleSyncControlDisplay);
            $(".interrupt-control").css('display', interruptControlDisplay);

            // If the fieldVal is 2 (command), then we should set the dayPartId to be 0 (custom)
            if (fieldVal == 2) {
                // Determine what the custom day part is.
                var $dayPartId = $("#dayPartId");
                var customDayPartId = 0;
                $dayPartId.find("option").each(function(i, el) {
                    if ($(el).data("isCustom") === 1) {
                        customDayPartId = $(el).val();
                    }
                });

                console.log('Setting dayPartId to custom: ' + customDayPartId);
                $dayPartId.val(customDayPartId);

                var $startTime = $(".starttime-control");
                $startTime.find("input[name=fromDt_Link2]").show();
                $startTime.find(".help-block").html($startTime.closest("form").data().daypartMessage);

                // Set the repeats/reminders tabs to visible.
                $("li.repeats").css("display", "block");
                $("li.reminders").css("display", "block");
            }
            
            // Call funtion for the daypart ID 
            processScheduleFormElements($('#dayPartId'));

            // Change the help text and label of the campaignId dropdown
            var $campaignSelect = el.closest("form").find("#campaignId");
            var $layoutControl = $(".layout-control");
            var searchIsLayoutSpecific = -1;

            if (fieldVal === "1" || fieldVal === "3" || fieldVal === "4") {
                // Load Layouts only
                searchIsLayoutSpecific = 1;

                // Change Label and Help text when Layout event type is selected
                $layoutControl.children("label").text($campaignSelect.data("transLayout"));
                $layoutControl.children("div").children("small.form-text.text-muted").text($campaignSelect.data("transLayoutHelpText"));

            } else {
                // Load Campaigns only
                searchIsLayoutSpecific = 0;

                // Change Label and Help text when Campaign event type is selected
                $layoutControl.children("label").text($campaignSelect.data("transCampaign"));
                $layoutControl.children("div").children("small.form-text.text-muted").text($campaignSelect.data("transCampaignHelpText"));
            }

            // Set the search criteria
            $campaignSelect.data("searchIsLayoutSpecific", searchIsLayoutSpecific);
            
            break;
        
        case 'dayPartId':
            console.log('Process: dayPartId, val = ' + fieldVal + ', visibility = ' + el.is(":visible"));

            if (!el.is(":visible"))
                return;

            var meta = el.find('option[value=' + fieldVal + ']').data();

            var endTimeControlDisplay = (meta.isCustom === 0) ? "none" : "";
            var startTimeControlDisplay = (meta.isAlways === 1) ? "none" : "";
            var repeatsControlDisplay = (meta.isAlways === 1) ? "none" : "";
            var reminderControlDisplay = (meta.isAlways === 1) ? "none" : "";

            var $startTime = $(".starttime-control");
            var $endTime = $(".endtime-control");
            var $repeats = $("li.repeats");
            var $reminder = $("li.reminders");

            // Set control visibility
            $startTime.css('display', startTimeControlDisplay);
            $endTime.css('display', endTimeControlDisplay);
            $repeats.css('display', repeatsControlDisplay);
            $reminder.css('display', reminderControlDisplay);

            // Dayparts only show the start control
            if (meta.isAlways === 0 && meta.isCustom === 0) {
                // We need to update the date/time controls to only accept the date element
                $startTime.find("input[name=fromDt_Link2]").hide();
                $startTime.find(".help-block").html($startTime.closest("form").data().notDaypartMessage);
            } else {
                $startTime.find("input[name=fromDt_Link2]").show();
                $startTime.find(".help-block").html($startTime.closest("form").data().daypartMessage);
            }
                        
            break;

        case 'campaignId':
            console.log('Process: campaignId, val = ' + fieldVal + ', visibility = ' + el.is(":visible"));

            // Update the preview button URL
            var $previewButton = $("#previewButton");

            if (fieldVal === null || fieldVal === '' || fieldVal === 0) {
                $previewButton.closest('.preview-button-container').hide();
            } else {
                $previewButton.closest('.preview-button-container').show();
                $previewButton.attr("href", $previewButton.data().url.replace(":id", fieldVal));
            }

            break;
    }
};

var duplicateScheduledEvent = function() {
    // Set the edit form URL to that of the add form
    var $scheduleForm = $("#scheduleEditForm");
    $scheduleForm.attr("action", $scheduleForm.data().addUrl).attr("method", "post");

    // Remove the duplicate button
    $("#scheduleDuplateButton").remove();

    toastr.info($scheduleForm.data().duplicatedMessage);
}

/**
 * Callback for the schedule form
 */
var setupScheduleNowForm = function(form) {

    setupSelectForSchedule(form);
    processScheduleFormElements($("#eventTypeId", form));

    // Hide the seconds input option unless seconds are enabled in the date format
    if (dateFormat.indexOf("s") <= -1) {
        $(form).find(".schedule-now-seconds-field").hide();
    }

    $(form).find("#always").on("change", function() {
        var always = $(form).find("#always").is(':checked');
        var dayPartId = (always) ? $(form).find("#alwaysDayPartId").val() : $(form).find("#customDayPartId").val();

        $(form).find("#dayPartId").val(dayPartId);

        $(form).find(".duration-part").toggle();
        if (dateFormat.indexOf("s") <= -1) {
            $(form).find(".schedule-now-seconds-field").hide();
        }
    });

    var evaluateDates = _.debounce(function() {
      scheduleNowFormEvaluateDates(form);
    }, 500);
    
    // Bind to the H:i:s fields
    $(form).find("#hours").on("keyup", evaluateDates);
    $(form).find("#minutes").on("keyup", evaluateDates);
    $(form).find("#seconds").on("keyup", evaluateDates);
};

/**
 * Evaluate dates on schedule form and fill the date input fields
 */
var scheduleNowFormEvaluateDates = function(form) {

    var always = $(form).find("#always").is(':checked');

    if (!always) {
        var hours = $(form).find("#hours").val();
        var minutes = $(form).find("#minutes").val();
        var seconds = $(form).find("#seconds").val();

        //var fromDt = moment().add(-24, "hours");
        var fromDt = moment();
        var toDt = moment();

        // Use Hours, Minutes and Seconds to generate a from date
        var $messageDiv = $('.scheduleNowMessage');

        if (hours != "")
            toDt.add(hours, "hours");

        if (minutes != "")
            toDt.add(minutes, "minutes");

        if (seconds != "")
            toDt.add(seconds, "seconds");

        // Update the message div
        $messageDiv.html($messageDiv.data().template.replace("[fromDt]", fromDt.format(jsDateFormat)).replace("[toDt]", toDt.format(jsDateFormat))).removeClass("d-none");

        // Update the final submit fields
        $("#fromDt").val(fromDt.format(systemDateFormat));
        $("#toDt").val(toDt.format(systemDateFormat));
    }
};

/**
 * Call evaluate values and then submit schedule now form
 */

var scheduleNowFormSubmit = function(form) {
  
  // Evaluate dates 
  scheduleNowFormEvaluateDates(form);
  
  // Submit the form
  form.submit();
};
  
/**
 * Select the elements linked to the clicked element
 */
var agendaSelectLinkedElements = function(elemType, elemID, data, eventId) {
    
    var targetEvents = [];
    var selectClass = {
            'layouts': 'selected-linked',
            'overlays': 'selected-linked',
            'displaygroups': 'selected-linked',
            'campaigns': 'selected-linked',
    };
    
    results = data.results[data.selectedDisplayGroup];
    
    var allEvents = results.events;
    
    // Get the correspondent events
    for (var i = 0; i < allEvents.length; i++) {
        if ( (elemType == 'layouts' || elemType == 'overlays') && allEvents[i].layoutId == elemID && allEvents[i].eventId == eventId ) {
            targetEvents.push(allEvents[i]);
            selectClass[elemType] = 'selected';
        } else if (elemType == 'displaygroups' && allEvents[i].displayGroupId == elemID) {
            targetEvents.push(allEvents[i]);
            selectClass['displaygroups'] = 'selected';
        } else if (elemType == 'campaigns' && allEvents[i].campaignId == elemID) {
            targetEvents.push(allEvents[i]);
            selectClass['campaigns'] = 'selected';
        }
    }
    
    // Use the target events to select the corresponding objects
    for (var i = 0; i < targetEvents.length; i++) {
        // Select the corresponding layout
        $('table[data-type="layouts"] tr[data-elem-id~="' + targetEvents[i].layoutId + '"][data-event-id~="' + targetEvents[i].eventId + '"]').addClass(selectClass['layouts']);
        
        // Select the corresponding display group
        $('table[data-type="displaygroups"] tr[data-elem-id~="' + targetEvents[i].displayGroupId + '"]').addClass(selectClass['displaygroups']);
        
        // Select the corresponding campaigns
        $('table[data-type="campaigns"] tr[data-elem-id~="' + targetEvents[i].campaignId + '"]').addClass(selectClass['campaigns']);
        
    }
    
};

var generateGeoMap = function () {

    if (mymap !== undefined && mymap !== null) {
        mymap.remove();
    }

    var defaultLat = $('#scheduleAddForm , #scheduleEditForm').data().defaultLat;
    var defaultLong = $('#scheduleAddForm , #scheduleEditForm').data().defaultLong;

    // base map
    mymap = L.map('geoScheduleMap').setView([defaultLat, defaultLong], 13);

    // base tile layer, provided by Open Street Map
    L.tileLayer( 'http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        subdomains: ['a','b','c']
    }).addTo( mymap );

    // Add a layer for drawn items
    var drawnItems = new L.FeatureGroup();
    mymap.addLayer(drawnItems);

    // Add draw control (toolbar)
    var drawControl = new L.Control.Draw({
        position: 'topright',
        draw: {
            polyline: false,
            circle: false,
            marker: false,
            circlemarker: false
        },
        edit: {
            featureGroup: drawnItems
        }
    });

    var drawControlEditOnly = new L.Control.Draw({
        position: 'topright',
        draw: false,
        edit: {
            featureGroup: drawnItems
        }
    });

    mymap.addControl(drawControl);

    // add search Control - allows searching by country/city and automatically moves map to that location
    var searchControl = new L.Control.Search({
        url: 'https://nominatim.openstreetmap.org/search?format=json&q={s}',
        jsonpParam: 'json_callback',
        propertyName: 'display_name',
        propertyLoc: ['lat','lon'],
        marker: L.circleMarker([0,0],{radius:30}),
        autoCollapse: true,
        autoType: false,
        minLength: 2,
        hideMarkerOnCollapse: true
    });

    mymap.addControl(searchControl);

    var json = '';
    var layer = null;
    var layers = null;

    // when user draws a new polygon it will be added as a layer to the map and as GeoJson to hidden field
    mymap.on('draw:created', function(e) {
        layer = e.layer;

        drawnItems.addLayer(layer);
        json = layer.toGeoJSON();

        $('#geoLocation').val(JSON.stringify(json));

        // disable adding new polygons
        mymap.removeControl(drawControl);
        mymap.addControl(drawControlEditOnly);
    });

    // update the hidden field geoJson with new coordinates
    mymap.on('draw:edited', function (e) {
        layers = e.layers;

        layers.eachLayer(function(layer) {

            json = layer.toGeoJSON();

            $('#geoLocation').val(JSON.stringify(json));
        });
    });

    // remove the layer and clear the hidden field
    mymap.on('draw:deleted', function (e) {
        layers = e.layers;

        layers.eachLayer(function(layer) {
            $('#geoLocation').val('');
            drawnItems.removeLayer(layer);
        });

        // re-enable adding new polygons
        if (drawnItems.getLayers().length === 0) {
            mymap.removeControl(drawControlEditOnly);
            mymap.addControl(drawControl);
        }
    });

    // if we are editing an event with existing Geo JSON, make sure we load it and add the layer to the map
    if ($('#geoLocation').val() != null && $('#geoLocation').val() !== '') {

        var geoJSON = JSON.parse($('#geoLocation').val());

        L.geoJSON(geoJSON, {
            onEachFeature: onEachFeature
        });

        function onEachFeature(feature, layer) {
            drawnItems.addLayer(layer);
            mymap.fitBounds(layer.getBounds());
        }

        // disable adding new polygons
        mymap.removeControl(drawControl);
        mymap.addControl(drawControlEditOnly);
    }
};

var generateFilterGeoMap = function() {
    if(mymap !== undefined && mymap !== null) {
        mymap.remove();
    }

    // Get location values
    var defaultLat = $('#geoLatitude').val();
    var defaultLong = $('#geoLongitude').val();

    // If values are not set, get system default location
    if(defaultLat == undefined || defaultLat == '' || defaultLong == undefined || defaultLong == '') {
        defaultLat = $('.cal-event-location-map').data('defaultLat');
        defaultLong = $('.cal-event-location-map').data('defaultLong');
    }

    // base map
    mymap = L.map('geoFilterAgendaMap').setView([defaultLat, defaultLong], 13);

    // base tile layer, provided by Open Street Map
    L.tileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        subdomains: ['a', 'b', 'c']
    }).addTo(mymap);

    // add search Control - allows searching by country/city and automatically moves map to that location
    var searchControl = new L.Control.Search({
        url: 'https://nominatim.openstreetmap.org/search?format=json&q={s}',
        jsonpParam: 'json_callback',
        propertyName: 'display_name',
        propertyLoc: ['lat', 'lon'],
        marker: L.circleMarker([0, 0], {radius: 30}),
        autoCollapse: true,
        autoType: false,
        minLength: 2,
        hideMarkerOnCollapse: true
    });

    mymap.addControl(searchControl);

    var setMarker = function(lat, lng) {
        if(mymapmarker != undefined) {
            mymap.removeLayer(mymapmarker);
        }

        mymapmarker = L.marker([lat, lng], mymap).addTo(mymap);
    };

    // Click to create marker
    mymap.on('click', function(e) {
        $('#geoLatitude').val(e.latlng.lat).change();
        $('#geoLongitude').val(e.latlng.lng).change();

        setMarker(e.latlng.lat, e.latlng.lng);
    });

    if($('#geoLatitude').val() != undefined && $('#geoLatitude').val() != '' && 
    $('#geoLongitude').val() != undefined && $('#geoLongitude').val() != '') {
        setMarker($('#geoLatitude').val(), $('#geoLongitude').val());
    }
};

var filterEventsByLocation = function(events) {
    var eventsResult = [];

    for(var index = 0;index < events.length; index++) {

        var event = events[index];

        if(event.geoLocation != '') {
            var geoJSON = JSON.parse(event.geoLocation);
            var point = [$('#geoLongitude').val(), $('#geoLatitude').val()];
            var polygon = L.geoJSON(geoJSON);

            var test = leafletPip.pointInLayer(point, polygon);

            if(test.length > 0) {
                eventsResult.push(event);
            }
        } else {
            eventsResult.push(event);
        }
    }

    return eventsResult;
};

var setupSelectForSchedule = function (dialog) {
    // Select lists
    var $campaignSelect = $('#campaignId', dialog);
    $campaignSelect.select2({
        ajax: {
            url: $campaignSelect.data("searchUrl"),
            dataType: "json",
            data: function(params) {
                var query = {
                    isLayoutSpecific: $campaignSelect.data("searchIsLayoutSpecific"),
                    retired: 0,
                    totalDuration: 0,
                    name: params.term,
                    start: 0,
                    length: 10,
                    columns: [
                        {
                            "data": "isLayoutSpecific"
                        },
                        {
                            "data": "campaign"
                        }
                    ],
                    order: [
                        {
                            "column": 0,
                            "dir": "asc"
                        },
                        {
                            "column": 1,
                            "dir": "asc"
                        }
                    ]
                };

                // Set the start parameter based on the page number
                if (params.page != null) {
                    query.start = (params.page - 1) * 10;
                }

                return query;
            },
            processResults: function(data, params) {
                var results = [];

                $.each(data.data, function(index, el) {
                    results.push({
                        "id": el["campaignId"],
                        "text": el["campaign"]
                    });
                });

                var page = params.page || 1;
                page = (page > 1) ? page - 1 : page;

                return {
                    results: results,
                    pagination: {
                        more: (page * 10 < data.recordsTotal)
                    }
                }
            }
        }
    });

    var $displaySelect = $('select[name="displayGroupIds[]"]', dialog);
    $displaySelect.select2({
        ajax: {
            url: $displaySelect.data("searchUrl"),
            dataType: "json",
            data: function(params) {
                var query = {
                    isDisplaySpecific: -1,
                    forSchedule: 1,
                    displayGroup: params.term,
                    start: 0,
                    length: 10,
                    columns: [
                        {
                            "data": "isDisplaySpecific"
                        },
                        {
                            "data": "displayGroup"
                        }
                    ],
                    order: [
                        {
                            "column": 0,
                            "dir": "asc"
                        },
                        {
                            "column": 1,
                            "dir": "asc"
                        }
                    ]
                };

                // Set the start parameter based on the page number
                if (params.page != null) {
                    query.start = (params.page - 1) * 10;
                }

                return query;
            },
            processResults: function(data, params) {
                var groups = [];
                var displays = [];

                $.each(data.data, function(index, element) {
                    if (element.isDisplaySpecific === 1) {
                        displays.push({
                            "id": element.displayGroupId,
                            "text": element.displayGroup
                        });
                    } else {
                        groups.push({
                            "id": element.displayGroupId,
                            "text": element.displayGroup
                        });
                    }
                });

                var page = params.page || 1;
                page = (page > 1) ? page - 1 : page;

                return {
                    results: [
                        {
                            "text": $displaySelect.data('transGroups'),
                            "children": groups
                        },{
                            "text": $displaySelect.data('transDisplay'),
                            "children": displays
                        }
                    ],
                    pagination: {
                        more: (page * 10 < data.recordsTotal)
                    }
                }
            }
        }
    });
};