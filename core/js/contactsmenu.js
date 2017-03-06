/* global OC.Backbone, Handlebars, Promise, _ */

/**
 * @copyright 2017 Christoph Wurst <christoph@winzerhof-wurst.at>
 *
 * @author 2017 Christoph Wurst <christoph@winzerhof-wurst.at>
 *
 * @license GNU AGPL version 3 or any later version
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 */

(function(OC, $, _, Handlebars) {
	'use strict';

	var LOADING_TEMPLATE = ''
		+ '<div class="emptycontent">'
		+ '    <a class="icon-loading"></a>'
		+ '    <h2>{{loadingText}}</h2>'
		+ '</div>';
	var ERROR_TEMPLATE = ''
		+ '<div class="emptycontent">'
		+ '    <h2>' + t('core', 'Could not load your contacts.') + '</h2>'
		+ '</div>';
	var CONTENT_TEMPLATE = ''
		+ '<input id="contactsmenu-search" type="search" placeholder="Search contacts …" value="{{searchTerm}}">'
		+ '<div class="content">'
		+ '    {{#unless contacts.length}}<div class="emptycontent">' + t('core', 'No contacts found.') + '</div>{{/unless}}'
		+ '    <div id="contactsmenu-contacts"></div>'
		+ '    {{#if contactsAppEnabled}}<div class="footer"><a href="{{contactsAppURL}}">' + t('core', 'Show all contacts …') + '</a></div>{{/if}}'
		+ '</div>';
	var CONTACT_TEMPLATE = ''
		+ '<div class="avatar"></div>'
		+ '<div class="body">'
		+ '    <div class="full-name">{{contact.fullName}}</div>'
		+ '    <div class="last-message">{{contact.lastMessage}}</div>'
		+ '</div>'
		+ '<a class="top-action {{contact.topAction.icon}}" href="{{contact.topAction.hyperlink}}"></a>'
		+ '{{#if contact.actions.length}}'
		+ '    <span class="other-actions icon-more"></span>'
		+ '    <div class="menu popovermenu">'
		+ '        <ul>'
		+ '            {{#each contact.actions}}'
		+ '            <li>'
		+ '                <a href="{{hyperlink}}">'
		+ '                    <span class="{{icon}}"></span>'
		+ '                    <span>{{title}}</span>'
		+ '                </a>'
		+ '            </li>'
		+ '            {{/each}}'
		+ '        </ul>'
		+ '    </div>'
		+ '{{/if}}';

	/**
	 * @class Contact
	 */
	var Contact = OC.Backbone.Model.extend({
		defaults: {
			fullName: '',
			lastMessage: '',
			actions: []
		}
	});

	/**
	 * @class ContactCollection
	 */
	var ContactCollection = OC.Backbone.Collection.extend({
		model: Contact
	});

	/**
	 * @class ContactsListView
	 */
	var ContactsListView = OC.Backbone.View.extend({

		/** @type {ContactsCollection} */
		_collection: undefined,

		/** @type {array} */
		_subViews: [],

		/**
		 * @param {object} options
		 * @returns {undefined}
		 */
		initialize: function(options) {
			this._collection = options.collection;
		},

		/**
		 * @returns {self}
		 */
		render: function() {
			var self = this;
			self.$el.html('');
			self._subViews = [];

			self._collection.forEach(function(contact) {
				var item = new ContactsListItemView({
					model: contact
				});
				item.render();
				self.$el.append(item.$el);
				item.on('toggle:actionmenu', self._onChildActionMenuToggle, self);
				self._subViews.push(item);
			});

			return self;
		},

		/**
		 * Event callback to propagate opening (another) entry's action menu
		 *
		 * @param {type} $src
		 * @returns {undefined}
		 */
		_onChildActionMenuToggle: function($src) {
			this._subViews.forEach(function(view) {
				view.trigger('parent:toggle:actionmenu', $src);
			});
		}
	});

	/**
	 * @class CotnactsListItemView
	 */
	var ContactsListItemView = OC.Backbone.View.extend({

		/** @type {string} */
		className: 'contact',

		/** @type {undefined|function} */
		_template: undefined,

		/** @type {Contact} */
		_model: undefined,

		/** @type {boolean} */
		_actionMenuShown: false,

		events: {
			'click .icon-more': '_onToggleActionsMenu'
		},

		/**
		 * @param {object} data
		 * @returns {undefined}
		 */
		template: function(data) {
			if (!this._template) {
				this._template = Handlebars.compile(CONTACT_TEMPLATE);
			}
			return this._template(data);
		},

		/**
		 * @param {object} options
		 * @returns {undefined}
		 */
		initialize: function(options) {
			this._model = options.model;
			this.on('parent:toggle:actionmenu', this._onOtherActionMenuOpened, this);
		},

		/**
		 * @returns {self}
		 */
		render: function() {
			this.$el.html(this.template({
				contact: this._model.toJSON()
			}));
			this.delegateEvents();

			this.$('.avatar').imageplaceholder(this._model.get('fullName'));

			return this;
		},

		/**
		 * Toggle the visibility of the action popover menu
		 *
		 * @private
		 * @returns {undefined}
		 */
		_onToggleActionsMenu: function() {
			this._actionMenuShown = !this._actionMenuShown;
			if (this._actionMenuShown) {
				this.$('.menu').show();
			} else {
				this.$('.menu').hide();
			}
			this.trigger('toggle:actionmenu', this.$el);
		},

		/**
		 * @private
		 * @argument {jQuery} $src
		 * @returns {undefined}
		 */
		_onOtherActionMenuOpened: function($src) {
			if (this.$el.is($src)) {
				// Ignore
				return;
			}
			this._actionMenuShown = false;
			this.$('.menu').hide();
		}
	});

	/**
	 * @class ContactsMenuView
	 */
	var ContactsMenuView = OC.Backbone.View.extend({

		/** @type {undefined|function} */
		_loadingTemplate: undefined,

		/** @type {undefined|function} */
		_errorTemplate: undefined,

		/** @type {undefined|function} */
		_contentTemplate: undefined,

		/** @type {undefined|ContactCollection} */
		_contacts: undefined,

		events: {
			'keyup #contactsmenu-search': '_onSearch'
		},

		/**
		 * @returns {undefined}
		 */
		_onSearch: _.debounce(function() {
			this.trigger('search', this.$('#contactsmenu-search').val());
		}, 700),


		/**
		 * @param {object} data
		 * @returns {string}
		 */
		loadingTemplate: function(data) {
			if (!this._loadingTemplate) {
				this._loadingTemplate = Handlebars.compile(LOADING_TEMPLATE);
			}
			return this._loadingTemplate(data);
		},

		/**
		 * @param {object} data
		 * @returns {string}
		 */
		errorTemplate: function(data) {
			if (!this._errorTemplate) {
				this._errorTemplate = Handlebars.compile(ERROR_TEMPLATE);
			}
			return this._errorTemplate(data);
		},

		/**
		 * @param {object} data
		 * @returns {string}
		 */
		contentTemplate: function(data) {
			if (!this._contentTemplate) {
				this._contentTemplate = Handlebars.compile(CONTENT_TEMPLATE);
			}
			return this._contentTemplate(data);
		},

		/**
		 * @param {object} options
		 * @returns {undefined}
		 */
		initialize: function(options) {
			this.options = options;
		},

		/**
		 * @param {string} text
		 * @returns {undefined}
		 */
		showLoading: function(text) {
			this._contacts = undefined;
			this.render({
				loading: true,
				loadingText: text
			});
		},

		/**
		 * @returns {undefined}
		 */
		showError: function() {
			this._contacts = undefined;
			this.render({
				error: true
			});
		},

		/**
		 * @param {object} viewData
		 * @param {string} searchTerm
		 * @returns {undefined}
		 */
		showContacts: function(viewData, searchTerm) {
			this._contacts = viewData.contacts;
			this.render({
				loading: false,
				searchTerm: searchTerm,
				contacts: viewData.contacts,
				contactsAppEnabled: viewData.contactsAppEnabled,
				contactsAppURL: OC.generateUrl('/apps/contacts')
			});
		},

		/**
		 * @param {object} data
		 * @returns {self}
		 */
		render: function(data) {
			if (!!data.error) {
				this.$el.html(this.errorTemplate(data));
				return this;
			}
			if (!!data.loading) {
				this.$el.html(this.loadingTemplate(data));
				return this;
			}

			var list = new ContactsListView({
				collection: data.contacts
			});
			list.render();
			this.$el.html(this.contentTemplate(data));
			this.$('#contactsmenu-contacts').html(list.$el);

			// Focus search
			this.$('#contactsmenu-search').focus();

			return this;
		}

	});

	/**
	 * @param {Object} options
	 * @param {jQuery} options.el
	 * @param {jQuery} options.trigger
	 * @class ContactsMenu
	 */
	var ContactsMenu = function(options) {
		this.initialize(options);
	};

	ContactsMenu.prototype = {
		/** @type {jQuery} */
		$el: undefined,

		/** @type {jQuery} */
		_$trigger: undefined,

		/** @type {ContactsMenuView} */
		_view: undefined,

		/** @type {Promise} */
		_contactsPromise: undefined,

		/**
		 * @param {Object} options
		 * @param {jQuery} options.el - the element to render the menu in
		 * @param {jQuery} options.trigger - the element to click on to open the menu
		 * @returns {undefined}
		 */
		initialize: function(options) {
			this.$el = options.el;
			this._$trigger = options.trigger;

			this._view = new ContactsMenuView({
				el: this.$el
			});
			this._view.on('search', function(searchTerm) {
				this._loadContacts(searchTerm);
			}, this);

			OC.registerMenu(this._$trigger, this.$el, function() {
				this._toggleVisibility(true);
			}.bind(this));
			this.$el.on('beforeHide', function() {
				this._toggleVisibility(false);
			}.bind(this));
		},

		/**
		 * @private
		 * @param {boolean} show
		 * @returns {Promise}
		 */
		_toggleVisibility: function(show) {
			if (show) {
				return this._loadContacts();
			} else {
				this.$el.html('');
				return Promise.resolve();
			}
		},

		/**
		 * @private
		 * @param {string|undefined} searchTerm
		 * @returns {Promise}
		 */
		_getContacts: function(searchTerm) {
			var url = OC.generateUrl('/contactsmenu/contacts');
			return Promise.resolve($.ajax(url, {
				method: 'GET',
				data: {
					filter: searchTerm
				}
			}));
		},

		/**
		 * @param {string|undefined} searchTerm
		 * @returns {undefined}
		 */
		_loadContacts: function(searchTerm) {
			var self = this;

			if (!self._contactsPromise) {
				self._contactsPromise = self._getContacts(searchTerm);
			}

			if (_.isUndefined(searchTerm) || searchTerm === '') {
				self._view.showLoading(t('core', 'Loading your contacts …'));
			} else {
				self._view.showLoading(t('core', 'Looking for {term} …', {
					term: searchTerm
				}));
			}
			return self._contactsPromise.then(function(data) {
				// Convert contact entries to Backbone collection
				data.contacts = new ContactCollection(data.contacts);

				self._view.showContacts(data, searchTerm);
			}, function(e) {
				self._view.showError();
				console.error('could not load contacts', e);
			}).then(function() {
				// Delete promise, so that contacts are fetched again when the
				// menu is opened the next time.
				delete self._contactsPromise;
			}).catch(console.error.bind(this));
		}
	};

	OC.ContactsMenu = ContactsMenu;

})(OC, $, _, Handlebars);
